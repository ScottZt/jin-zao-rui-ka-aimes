import prisma from '../prisma.js';

// Simulated LLM Service for Food Industry Voice NLU
export class LLMProxyService {
  static async parseVoiceCommand(userId: string, rawText: string) {
    // In a real scenario, this would call DeepSeek / GPT with a prompt
    // tailored to the burger factory vocabulary.
    
    let intentData: any = { intent: 'unknown' };
    
    // Food Industry Vocab Mapping
    const goodKeywords = ['合格', '完好'];
    const badKeywords = ['报废', '次品', '变形', '焦糊', '烤焦', '漏酱', '少酱', '缺菜', '少菜', '破损'];
    const processKeywords = [
      '成品装箱',
      '包装封口',
      '汉堡组装',
      '蔬菜切配',
      '面包烘烤',
      '肉饼煎制',
      '炸肉饼',
      '酱料涂抹',
      '解冻预处理',
      '半成品暂存',
      '清洁消毒',
      '装箱',
      '包装',
      '组装',
      '切配',
    ];
    
    const isReport = rawText.includes('报工');
    const isException = rawText.includes('异常') || rawText.includes('待料') || rawText.includes('故障');

    if (isReport) {
      // Basic RegEx to extract numbers. A real LLM handles this much better.
      const numbers = rawText.match(/\d+/g) || [];
      let goodQty = 0;
      let badQty = 0;
      
      // Determine if a number is for good or bad based on preceding words
      // Very simplified simulation
      if (numbers.length >= 1) {
          goodQty = parseInt(numbers[0], 10);
      }
      if (numbers.length >= 2) {
          badQty = parseInt(numbers[1], 10);
      }

      // Try to find process name
      let detectedProcess = '当前工序';
      for (const p of processKeywords) {
          if (rawText.includes(p)) {
              detectedProcess = p;
              break;
          }
      }

      intentData = {
        intent: 'report',
        process: detectedProcess,
        good_qty: goodQty,
        bad_qty: badQty,
      };
    } else if (isException) {
      let exceptionType = '品质';
      if (rawText.includes('设备') || rawText.includes('故障') || rawText.includes('坏了') || rawText.includes('炸锅') || rawText.includes('烤箱')) {
          exceptionType = '设备';
      } else if (rawText.includes('待料') || rawText.includes('缺')) {
          exceptionType = '物料';
      } else if (rawText.includes('卫生') || rawText.includes('清洁')) {
          exceptionType = '卫生合规';
      }

      intentData = {
        intent: 'exception',
        type: exceptionType,
        detail: rawText,
      };
    }

    // Simulate token usage
    const promptTokens = 150 + Math.floor(Math.random() * 50); // Food vocab prompt is slightly longer
    const completionTokens = 45 + Math.floor(Math.random() * 20);
    const costPer1k = 0.002;
    const totalCost = ((promptTokens + completionTokens) / 1000) * costPer1k;

    // Log the token usage asynchronously
    await prisma.tokenLog.create({
      data: {
        userId: userId,
        featureModule: 'food-voice-nlu',
        promptTokens,
        completionTokens,
        totalCost,
      }
    });

    return intentData;
  }
}
