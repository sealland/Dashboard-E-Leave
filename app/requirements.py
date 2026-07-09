"""Consolidated requirements for the next dashboard module (Approval Summary)."""

from __future__ import annotations

NEXT_DASHBOARD_REQUIREMENTS: dict = {
    "id": "e-approval",
    "title": "Dashboard Approval Summary",
    "goal": "ภาพรวมการอนุมัติคำร้อง HR ทุกประเภท สำหรับผู้บริหาร — ไม่แยกเฉพาะลาหรือล่วงเวลา",
    "data_source": {
        "table": "dbo.ZHR_WEBAPP",
        "database": "INFO",
        "key_fields": [
            "RQI_REF — เลขที่คำร้อง",
            "RQI_DATE — วันยื่นคำร้อง",
            "RQI_FROM_DATE / RQI_TO_DATE — ช่วงวันขอลา/ทำงาน",
            "RQI_WBDT — ประเภท (1=ล่วงเวลา, 2=ลา)",
            "App_DateN1 / App_DateHR — วันที่หัวหน้าและ HR อนุมัติ",
            "API_APRS = 101 — ไม่อนุมัติ",
        ],
    },
    "business_rules": [
        "สถานะอนุมัติ: ไม่มี App_DateN1 → รอหัวหน้า | มี N1 แต่ไม่มี HR → รอ HR | ครบทั้งคู่ → อนุมัติครบ",
        "API_APRS = 101 แสดงเป็น ไม่อนุมัติ — ไม่นับใน KPI ค้างอนุมัติ",
        "วันที่อนุมัติ (approval dates) มีความสำคัญกว่า RQI_ACTIVE ในการแสดงสถานะ",
        "เลยวันลา: นับจาก RQI_FROM_DATE เมื่อยังอนุมัติไม่ครบและวันลาผ่านแล้ว",
        "เลยวัน HR: นับจาก App_DateN1 เมื่อรอ HR และยังไม่มี App_DateHR",
        "แจ้งเตือนค้างเกินเกณฑ์ — N1 ≥3/7 วัน, HR ≥5/14 วัน",
    ],
    "features": [
        {
            "group": "ตัวกรอง",
            "items": [
                "ช่วงวันที่ยื่นคำร้อง (default ต้นเดือน–วันนี้, จำค่าที่ user เลือก)",
                "แผนก, ประเภทคำร้อง (ทุก WBDT), สถานะอนุมัติ, สถานะใบลา, ค้นหา",
            ],
        },
        {
            "group": "KPI / สรุป",
            "items": [
                "จำนวนคำร้องทั้งหมด, รอหัวหน้า, รอ HR, อนุมัติครบ, ไม่อนุมัติ",
                "ระยะเวลาเฉลี่ยแต่ละขั้น (ยื่น→N1, ลา→N1, N1→HR, ลา→HR)",
                "แยกสรุปตามประเภทคำร้อง (ลา / ล่วงเวลา / อื่นๆ)",
            ],
        },
        {
            "group": "กราฟ",
            "items": [
                "แผนก Top 15 — จำนวนตามเอกสาร, เรียงชื่อแผนกแบบ natural sort",
                "สถานะค้างอนุมัติแยกตามประเภทคำร้อง",
                "แนวโน้มรายวัน/รายสัปดาห์ (optional — รอบถัดไป)",
            ],
        },
        {
            "group": "ตารางรายการ",
            "items": [
                "เลขที่, วันขอลา/วันขอ OT, วันที่เอกสาร, ประเภท, ชื่อ, แผนก",
                "สถานะ, วันที่หัวหน้าอนุมัติ, วันที่ HR อนุมัติ",
                "คอลัมน์เลยวันลา / เลยวัน HR (ซ่อนหัวคอลัมน์, แสดงตัวเลข)",
                "คลิกแถวดูรายละเอียด + timeline แต่ละขั้น",
            ],
        },
        {
            "group": "ระบบ",
            "items": [
                "แจ้งเตือน bell + browser notification",
                "รองรับ LAN, auto-start Windows",
                "Landing page + เมนูสลับ Dashboard",
            ],
        },
    ],
    "differences_from_e_leave": [
        "ไม่กรองเฉพาะ RQI_WBDT = 2 — รวมทุกประเภทคำร้อง",
        "KPI และกราฟเน้นภาพรวมทั้งองค์กร ไม่เฉพาะการลา",
        "เปรียบเทียบประเภทคำร้องในหน้าเดียว",
        "อาจมี drill-down ไป E-Leave สำหรับรายละเอียดลาเฉพาะ",
    ],
    "out_of_scope": [
        "Dashboard E-Overtime แยกต่างหาก — รวมอยู่ใน Approval Summary แทน",
    ],
}
