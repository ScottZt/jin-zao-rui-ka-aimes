import os
import json
from production_reporting import report_work_order_by_id

def run_test(work_order_id: int) -> None:
    base = os.getenv("WHEEL_APP_BASE_URL", "http://localhost:18080")
    print(f"Using base: {base}")
    res = report_work_order_by_id(
        work_order_id=work_order_id,
        operator_id=1001,
        operator_code="OP1001",
        operator_name="测试员",
        report_quantity=5,
        qualified_quantity=5,
        unqualified_quantity=0,
        work_time=30,
        remark="MCP报工测试"
    )
    print(json.dumps(res, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    wid = int(os.getenv("TEST_WORK_ORDER_ID", "11"))
    run_test(wid)
