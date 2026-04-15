import { Router, Request, Response } from 'express';
import prisma from '../prisma.js';
import { LLMProxyService } from '../services/llm.js';
import { updateSkillFromException, updateSkillFromReport } from '../services/skillUpdater.js';
import { createEquipmentFaultEvent } from '../services/equipmentUpdater.js';
import { computeSettlementForUserNow } from '../services/wageEngine.js';

const router = Router();

const normalizeProcessName = (raw: string) => {
  if (raw === '包装') return '包装封口';
  if (raw === '组装') return '汉堡组装';
  if (raw === '切配') return '蔬菜切配';
  if (raw === '肉饼煎制') return '肉饼煎制/炸制';
  if (raw === '炸肉饼') return '肉饼煎制/炸制';
  return raw;
};

const finalProcesses = new Set(['包装封口', '成品装箱']);
const processNameToCode: Record<string, string> = {
  '面包烘烤': 'P_BAKE_BUN',
  '肉饼煎制/炸制': 'P_FRY_PATTY',
  '蔬菜切配': 'P_CUT_VEG',
  '酱料涂抹': 'P_SPREAD_SAUCE',
  '汉堡组装': 'P_ASSEMBLE',
  '包装封口': 'P_PACK',
  '成品装箱': 'P_BOX',
  '设备清洁': 'P_CLEAN_EQUIP',
  '卫生合规': 'P_SANITATION',
};

router.post('/voice-command', async (req: Request, res: Response) => {
  const { card_id, audio_base64, timestamp, voice_text } = req.body;

  try {
    // 1. Identify User via card_id
    const user = await prisma.user.findUnique({
      where: { cardId: card_id }
    });

    if (!user) {
      return res.status(404).json({ code: 404, tts_text: "卡片未授权，无法识别身份。", action_status: "error" });
    }

    // 2. Simulate ASR (Speech-to-Text)
    // Normally, audio_base64 -> Whisper API -> text
    // For demo, we accept `voice_text` directly if provided, or default to a test string.
    const rawText = voice_text || "报工，合格50件";

    // 3. NLU via LLMProxyService (also logs Token Cost)
    const intentData = await LLMProxyService.parseVoiceCommand(user.id, rawText);

    // 4. Process Intent
    let ttsResponse = "";

    // Find user's active task
    const activeTask = await prisma.task.findFirst({
      where: { userId: user.id, status: 'active' },
      include: { order: true }
    });

    if (!activeTask) {
      return res.json({ 
        code: 400, 
        tts_text: `${user.name}，您当前没有待处理的派工任务。`, 
        action_status: "error" 
      });
    }

    if (intentData.intent === 'report') {
      // Create Report Log
      await prisma.reportLog.create({
        data: {
          taskId: activeTask.id,
          userId: user.id,
          type: 'normal',
          goodQty: intentData.good_qty || 0,
          badQty: intentData.bad_qty || 0,
          voiceRawText: rawText
        }
      });

      // Fetch user's level to apply piece rate
      const workerSkill = await prisma.skillModel.findFirst({
        where: { targetType: 'user', targetId: user.id }
      });
      
      let processName = intentData.process && intentData.process !== '当前工序' ? intentData.process : activeTask.processName;
      processName = normalizeProcessName(processName);
      const goodQty = intentData.good_qty || 0;
      const badQty = intentData.bad_qty || 0;

      const skillLevel = workerSkill ? workerSkill.level : 1;
      const processCode = processNameToCode[processName] || null;
      const pieceRate = processCode
        ? await prisma.pieceRate.findFirst({
            where: { processCode, level: skillLevel },
            orderBy: { effectiveFrom: 'desc' },
          })
        : null;
      const unitPrice = pieceRate?.unitPrice ?? activeTask.unitPrice;
      const wage = (goodQty * unitPrice).toFixed(2);

      const plan = await prisma.workOrderProcessPlan.findFirst({
        where: { orderId: activeTask.orderId, processName },
      });
      if (plan) {
        const nextActual = plan.actualQty + goodQty;
        await prisma.workOrderProcessPlan.update({
          where: { id: plan.id },
          data: {
            actualQty: nextActual,
            status: nextActual >= plan.planQty ? 'completed' : plan.status === 'pending' ? 'active' : plan.status,
          },
        });
      }

      let materialWarning = '';

      if (finalProcesses.has(processName)) {
        await prisma.transaction.create({
          data: {
            materialId: activeTask.order.productId,
            orderId: activeTask.orderId,
            type: 'in',
            qty: goodQty,
            sourceDocId: activeTask.id,
          }
        });

        const currentInventory = await prisma.inventory.findUnique({
          where: { materialId: activeTask.order.productId }
        });

        if (currentInventory) {
          await prisma.inventory.update({
            where: { materialId: activeTask.order.productId },
            data: {
              currentQty: currentInventory.currentQty + goodQty
            }
          });
        }

        const bomItems = await prisma.bOMItem.findMany({
          where: { productId: activeTask.order.productId },
          include: { material: true },
        });

        for (const item of bomItems) {
          const required = goodQty * item.qtyPerUnit;
          if (required <= 0) continue;

          const inv = await prisma.inventory.findUnique({ where: { materialId: item.materialId } });
          const currentQty = inv?.currentQty ?? 0;
          const nextQty = Math.max(0, currentQty - required);

          if (!inv) {
            await prisma.inventory.create({
              data: { materialId: item.materialId, currentQty: nextQty },
            });
          } else {
            await prisma.inventory.update({
              where: { materialId: item.materialId },
              data: { currentQty: nextQty },
            });
          }

          await prisma.transaction.create({
            data: {
              materialId: item.materialId,
              orderId: activeTask.orderId,
              type: 'out',
              qty: required,
              sourceDocId: activeTask.id,
            }
          });

          if (currentQty < required) {
            await prisma.exception.create({
              data: {
                taskId: activeTask.id,
                type: '物料',
                description: `待料：${item.material.name} 库存不足（需${required}${item.material.unit}，现有${currentQty}${item.material.unit}）`,
              }
            });
            materialWarning = '，已触发缺料预警';
          }
        }

        const finalPlan = await prisma.workOrderProcessPlan.findFirst({
          where: { orderId: activeTask.orderId, processName: '成品装箱' },
        });

        if (processName === '成品装箱' && finalPlan && finalPlan.actualQty + goodQty >= finalPlan.planQty) {
          await prisma.workOrder.update({
            where: { id: activeTask.orderId },
            data: { status: 'completed' },
          });
        }
      }

      await updateSkillFromReport({
        userId: user.id,
        processName,
        goodQty,
        badQty,
      })

      await computeSettlementForUserNow(user.id)

      ttsResponse = `${user.name}，报工成功。工序：${processName}，合格${goodQty}个，预估工资增加 ${wage} 元${materialWarning}。`;
    } 
    else if (intentData.intent === 'exception') {
      await prisma.exception.create({
        data: {
          taskId: activeTask.id,
          type: intentData.type,
          description: intentData.detail || "未知异常",
        }
      });

      await updateSkillFromException({
        userId: user.id,
        exceptionType: intentData.type,
      })

      if (intentData.type === '设备') {
        await createEquipmentFaultEvent({
          taskId: activeTask.id,
          description: intentData.detail || rawText,
        })
      }
      await computeSettlementForUserNow(user.id)
      ttsResponse = `${user.name}，已记录异常，已通过企业微信通知主管处理。`;
    }
    else {
      ttsResponse = `未能识别您的指令内容，请重新播报。`;
    }

    // Return the required response structure
    return res.json({
      code: 200,
      tts_text: ttsResponse,
      action_status: "success",
      intent_parsed: intentData
    });

  } catch (error) {
    console.error("Voice command error:", error);
    return res.status(500).json({ code: 500, tts_text: "系统错误，请重试", action_status: "error" });
  }
});

export default router;
