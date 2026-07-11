<?php
error_reporting(E_ALL);
ini_set('display_errors', 1); // เปลี่ยนเป็น 1 เพื่อดู error
ini_set('log_errors', 1);
ini_set('error_log', __DIR__ . '/error.log'); // กำหนด path error log

// เพิ่ม memory และ time limit
ini_set('memory_limit', '512M');
set_time_limit(300);


/**
 * Creates an example PDF TEST document using TCPDF
 * @package com.tecnick.tcpdf
 * @abstract TCPDF - Example: HTML tables and table headers
 * @author Nicola Asuni
 * @since 2009-03-20
 */


require_once('tcpdf_include.php');


class MYPDF extends TCPDF {
    public $param_s;
    public $param_e;
    public $dfName;


//connect ผ่าน sql
    public function Header() {
        // ตรวจสอบว่ามีค่าหรือไม่
        $dfName = isset($this->dfName) ? $this->dfName : '';
        $param_s = isset($this->param_s) ? $this->param_s : '';
        $param_e = isset($this->param_e) ? $this->param_e : '';
        
        $this->SetFont('thsarabun', 'B', 14);
        
        $titleHtml = '
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="left">
            <h3 style="margin: 0; padding: 0; line-height: 0.5;font-style: italic;">รายงานสรุปค่าล่วงเวลา ('.$dfName.')</h3>
            <p style="margin: 0; padding: 0; line-height: 0.9;font-style: italic;">ช่วงวันที่ '.$param_s.' ถึง '.$param_e.'</p>
            </td>
          </tr>

          <tr style="font-size: 12pt;line-height: 1.2;" border="1">
            <th align="center" width="5%" style="border: 1px solid #000;" rowspan="2">รหัส</th>
            <th align="center" width="10%" style="border: 1px solid #000;" rowspan="2">ชื่อ-นามสกุล</th>
            <th align="center" width="83.08%" style="border: 1px solid #000;">วันทำงาน</th>
            <th align="center" width="4%" style="border: 1px solid #000;" rowspan="2">รวม</th>
          </tr>
            
          <tr style="font-size: 12pt;line-height: 1.2;" border="1">
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>26</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>27</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>28</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>29</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>30</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>31</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>1</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>2</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>3</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>4</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>5</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>6</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>7</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>8</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>9</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>10</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>11</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>12</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>13</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>14</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>15</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>16</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>17</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>18</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>19</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>20</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>21</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>22</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>23</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>24</b></th>
            <th align="center" width ="2.68%" style="border: 1px solid #000;"><b>25</b></th>
          </tr>

        </table>
      ';

        $this->writeHTML($titleHtml, true, false, false, false, '');

    }
    public function Footer() {
        // ข้อความอธิบายการใช้งาน parameter
        // $this->SetY(-15);
        // $this->SetFont('thsarabun', '', 7); // ใช้ขนาดเล็กกว่าเพื่อให้ดูบาง
        // $this->SetTextColor(150, 150, 150); // สีเทาอ่อน
        
        // $footerText = 'dept_code = ALL , br_code = NULL แสดงข้อมูลทั้งหมด | dept_code = ALL , br_code = สาขา แสดงข้อมูลทั้งหมดตาม br_code';
        // $this->Cell(0, 10, $footerText, 0, false, 'C', 0, '', 0, false, 'T', 'M');
    }

}

// ------------------------------
// รับค่า Parameter ก่อน
// ------------------------------
$param_period = isset($_GET['period']) ? trim($_GET['period']) : '';
$param_year   = isset($_GET['period_year']) ? trim($_GET['period_year']) : '';
if ($param_year === '' && isset($_GET['year'])) {
    $param_year = trim($_GET['year']);
}
$param_df     = isset($_GET['df_code']) ? trim($_GET['df_code']) : '';

$param_s = '';
$param_e = '';

if ($param_period === '') {
    http_response_code(400);
    die('Error: Missing required parameter period');
}

$periodMatcher = null;

if (preg_match('/^\d{4}-(0[1-9]|1[0-2])$/', $param_period, $periodMatcher)) {
    $periodYear  = substr($param_period, 0, 4);
    $periodMonth = substr($param_period, 5, 2);
} elseif (preg_match('/^(0?[1-9]|1[0-2])$/', $param_period, $periodMatcher)) {
    if ($param_year === '') {
        $param_year = date('Y');
    }
    if (!preg_match('/^\d{4}$/', $param_year)) {
        http_response_code(400);
        die('Error: Invalid period_year format. Use YYYY');
    }
    $periodYear  = $param_year;
    $periodMonth = str_pad($periodMatcher[1], 2, '0', STR_PAD_LEFT);
    $param_period = $periodYear . '-' . $periodMonth;
} else {
    http_response_code(400);
    die('Error: Invalid period format. Use YYYY-MM or MM (with period_year)');
}

$periodBase = DateTimeImmutable::createFromFormat('Y-m-d', $periodYear . '-' . $periodMonth . '-01');
if ($periodBase === false) {
    http_response_code(400);
    die('Error: Failed to parse period month');
}

$previousMonth = $periodBase->modify('-1 month');
$periodStart   = $previousMonth->setDate(
    (int)$previousMonth->format('Y'),
    (int)$previousMonth->format('m'),
    26
);
$periodEnd = $periodBase->setDate(
    (int)$periodBase->format('Y'),
    (int)$periodBase->format('m'),
    25
);

$param_s = $periodStart->format('Y-m-d');
$param_e = $periodEnd->format('Y-m-d');

if (empty($param_df)) {
    http_response_code(400);
    die('Error: Missing required parameter df_code');
}

// map df_code -> ชื่อ
$dfName = '';
switch ($param_df) {
  case '1110': $dfName = 'ค่าล่วงเวลา X1';   break;
  case '1120': $dfName = 'ค่าล่วงเวลา X1.5'; break;
  case '1130': $dfName = 'ค่าล่วงเวลา X2';   break;
  case '1140': $dfName = 'ค่าล่วงเวลา X3';   break;
  case '1150': $dfName = 'ค่าล่วงเวลา';      break;
  default:
  http_response_code(400);
  die('Error: Invalid df_code');
}

// สร้าง PDF object
try {
    $pdf = new MYPDF(PDF_PAGE_ORIENTATION, PDF_UNIT, PDF_PAGE_FORMAT, true, 'UTF-8', false);
    $pdf->param_s = $param_s;
    $pdf->param_e = $param_e;
    $pdf->dfName = $dfName;
} catch (Exception $e) {
    error_log('PDF Creation Error: ' . $e->getMessage());
    http_response_code(500);
    die('Error: Failed to create PDF object');
}
// *** กำหนดค่า Parameter ให้ object เพื่อใช้ใน Header() ***
$pdf->param_s = $param_s;
$pdf->param_e = $param_e;
$pdf->dfName = $dfName;



// set document information
$pdf->SetCreator(PDF_CREATOR);
$pdf->SetAuthor('ZUBB');
$pdf->SetTitle('รายงานสรุป'.$dfName.''); //ชื่อเอกสาร (แสดงบน title bar)


// set default header data
$pdf->SetHeaderData(PDF_HEADER_LOGO, PDF_HEADER_LOGO_WIDTH, PDF_HEADER_TITLE.' 048', PDF_HEADER_STRING);


// set header and footer fonts
$pdf->setHeaderFont(Array(PDF_FONT_NAME_MAIN, '', PDF_FONT_SIZE_MAIN));
$pdf->setFooterFont(Array(PDF_FONT_NAME_DATA, '', PDF_FONT_SIZE_DATA));

// set default monospaced font
$pdf->SetDefaultMonospacedFont(PDF_FONT_MONOSPACED);

// set margins
$pdf->SetMargins(5, 31, 10); //กั้นขอบ ซ้าย ขวา (เพิ่ม top margin เป็น 30 เพื่อให้มีที่สำหรับ Header)
//$pdf->SetMargins(PDF_MARGIN_LEFT, PDF_MARGIN_TOP, PDF_MARGIN_RIGHT);
$pdf->SetHeaderMargin(5); //กั้นขอบบน (ลดลงเพื่อให้ Header แสดงได้ดีขึ้น)
$pdf->SetFooterMargin(10); //กั้นขอบล่าง

// set auto page breaks
$pdf->SetAutoPageBreak(TRUE, 10); //ตั้งค่าขึ้นหน้าใหม่เมื่อข้อมูลถึงพิกัดที่กำหนดจากขอบกระดาษล่าง

// set image scale factor
$pdf->setImageScale(PDF_IMAGE_SCALE_RATIO);

// set some language-dependent strings (optional)
if (@file_exists(dirname(__FILE__).'/lang/eng.php')) {
    require_once(dirname(__FILE__).'/lang/eng.php');
    $pdf->setLanguageArray($l);
}

// *** อย่าเรียก AddPage() ที่นี่ เพราะจะเรียก Header() ก่อนที่ข้อมูลจะพร้อม ***
// $pdf->AddPage('L','A4'); // ลบบรรทัดนี้ออก - จะเรียก AddPage() หลังจากดึงข้อมูลแล้ว



// *** 1. connect DB ***
$serverName = "192.168.100.222";
$connectionInfo = array(
    "Database" => "INFO",
    "UID" => "sap",
    "PWD" => "w,j,uxyPsk0Ut",
    "ReturnDatesAsStrings" => true,
    "CharacterSet" => "UTF-8"
);
$conn = sqlsrv_connect($serverName, $connectionInfo);
if ($conn === false) {
    $errors = sqlsrv_errors();
    error_log('Database Connection Error: ' . print_r($errors, true));
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    die('Error: Database connection failed. Please check error log.');
}

// ------------------------------
// 1) รับค่า Parameter (รับไปแล้วด้านบน ไม่ต้องรับซ้ำ)
// ------------------------------
// $param_s, $param_e, $param_df รับไปแล้วด้านบน
// เพิ่มอ่านค่าพนักงานที่ขอเข้าถึง (PRS_NO) จาก parameter c
$param_c = isset($_GET['c']) ? trim($_GET['c']) : '';
// เพิ่มอ่านค่า br_code จาก parameter br_code
$param_br_code = isset($_GET['br_code']) ? trim($_GET['br_code']) : '';

// ------------------------------
// 1.1) ดึงสิทธิ์การเข้าถึงแผนกของพนักงานจาก [INFO].[dbo].[ZHR_AUTHORIZATION]
//      (รายการสาขาที่เลือกได้ถูกกรองที่ frontend แล้ว ไม่กรอง BR_CODE ที่นี่)
// ------------------------------
$authorizedDeptCodes = [];
$hasAllAccess = false; // ตรวจสอบว่ามีสิทธิ์ 'ALL' หรือไม่
if ($param_c !== '') {
	$authSql = "
		SELECT DISTINCT DEPT_CODE
		FROM [INFO].[dbo].[ZHR_AUTHORIZATION]
		WHERE PRS_NO = ?
	";
	$authParams = array($param_c);

	$authStmt = sqlsrv_query($conn, $authSql, $authParams);
	if ($authStmt === false) {
		$errors = sqlsrv_errors();
		error_log('Auth Query Error: ' . print_r($errors, true));
		sqlsrv_close($conn);
		http_response_code(500);
		header('Content-Type: text/plain; charset=utf-8');
		die('Error: Failed to check authorization. Please check error log.');
	}
	while ($r = sqlsrv_fetch_array($authStmt, SQLSRV_FETCH_ASSOC)) {
		if (isset($r['DEPT_CODE']) && $r['DEPT_CODE'] !== '') {
			// ถ้า DEPT_CODE เป็น 'ALL' ให้ตั้งค่า flag และไม่ต้องเก็บใน array
			if (strtoupper(trim($r['DEPT_CODE'])) === 'ALL') {
				$hasAllAccess = true;
			} else {
				$authorizedDeptCodes[] = $r['DEPT_CODE'];
			}
		}
	}
	sqlsrv_free_stmt($authStmt);
}

// ------------------------------
// 1.2) ดึงสิทธิ์การเข้าถึงสาขา (BR_CODE) ของพนักงานจาก [INFO].[dbo].[ZHR_AUTHORIZATION]
//      เมื่อ br_code=ALL และมี param_c
// ------------------------------
$authorizedBrCodes = [];
$hasAllBrAccess = false; // ตรวจสอบว่ามีสิทธิ์ 'ALL' สำหรับ BR_CODE หรือไม่
if ($param_br_code !== '' && strtoupper($param_br_code) === 'ALL' && $param_c !== '') {
	$brAuthSql = "
		SELECT DISTINCT BR_CODE
		FROM [INFO].[dbo].[ZHR_AUTHORIZATION]
		WHERE PRS_NO = ?
		  AND BR_CODE IS NOT NULL
		  AND BR_CODE <> ''
	";
	$brAuthStmt = sqlsrv_query($conn, $brAuthSql, array($param_c));
	if ($brAuthStmt === false) {
		$errors = sqlsrv_errors();
		error_log('BR Auth Query Error: ' . print_r($errors, true));
		sqlsrv_close($conn);
		http_response_code(500);
		header('Content-Type: text/plain; charset=utf-8');
		die('Error: Failed to check BR authorization. Please check error log.');
	}
	while ($r = sqlsrv_fetch_array($brAuthStmt, SQLSRV_FETCH_ASSOC)) {
		if (isset($r['BR_CODE']) && $r['BR_CODE'] !== '') {
			$brCodeValue = trim($r['BR_CODE']);
			// ถ้า BR_CODE เป็น 'ALL' ให้ตั้งค่า flag และไม่ต้องเก็บใน array
			if (strtoupper($brCodeValue) === 'ALL') {
				$hasAllBrAccess = true;
			} else {
				$authorizedBrCodes[] = $brCodeValue;
			}
		}
	}
	sqlsrv_free_stmt($brAuthStmt);
}

// ------------------------------
// 2) สร้างช่วงวันที่ 26 เดือนที่แล้ว - 25 เดือนปัจจุบัน
//    (ใช้ตามค่าที่ส่งมาก็ได้เลย)
// ------------------------------
function buildPeriodDates($start, $end) {
    try {
        $dates = [];
        $startD = new DateTime($start);
        $endD   = new DateTime($end);
        
        if ($startD > $endD) {
            throw new Exception('Start date must be before end date');
        }
        
        while ($startD <= $endD) {
            $dates[] = $startD->format('Y-m-d');
            $startD->modify('+1 day');
            
            // ป้องกัน infinite loop
            if (count($dates) > 1000) {
                throw new Exception('Date range too large (max 1000 days)');
            }
        }
        return $dates;
    } catch (Exception $e) {
        error_log('Date Range Error: ' . $e->getMessage());
        throw $e;
    }
}

try {
    $periodDates = buildPeriodDates($param_s, $param_e);
} catch (Exception $e) {
    http_response_code(400);
    header('Content-Type: text/plain; charset=utf-8');
    die('Error: ' . $e->getMessage());
}
// ------------------------------
// 3) ดึงข้อมูลจาก vw_empcheck ครั้งเดียว
// ------------------------------
$sql = "
	SELECT BR_CODE, BR_THAIDESC,
	       DEPT_CODE, DEPT_THAIDESC,
	       PRS_NO, EMP_NAME, EMP_SURNME,
	       TMR_DATE, tmr_QTY_t
	FROM vw_empcheck
	WHERE TMR_DATE BETWEEN ? AND ?
	  AND df_code = ?
";

// ถ้ามีการส่ง br_code มา และไม่ใช่ 'ALL' ให้เพิ่มเงื่อนไข BR_CODE
if ($param_br_code !== '' && strtoupper($param_br_code) !== 'ALL') {
	$sql .= "\n	  AND BR_CODE = ?\n";
} else if ($param_br_code !== '' && strtoupper($param_br_code) === 'ALL' && $param_c !== '') {
	// เมื่อ br_code=ALL และมี param_c ให้ใช้ BR_CODE จากสิทธิ์ที่ได้รับอนุญาต
	if ($hasAllBrAccess) {
		// มีสิทธิ์ 'ALL' สำหรับ BR_CODE ไม่ต้องกรอง BR_CODE
		// ไม่ต้องเพิ่ม WHERE clause สำหรับ BR_CODE
	} else if (count($authorizedBrCodes) > 0) {
		// มีสิทธิ์เห็น BR_CODE บางตัว ให้กรองเฉพาะ BR_CODE ที่ได้รับอนุญาต
		$brInPlaceholders = implode(',', array_fill(0, count($authorizedBrCodes), '?'));
		$sql .= "\n	  AND BR_CODE IN ($brInPlaceholders)\n";
	} else {
		// ไม่มีสิทธิ์เห็นสาขาใด ๆ
		$sql .= "\n	  AND 1=0\n";
	}
}

// ถ้ามีการส่ง c มา ให้จำกัดสิทธิ์เฉพาะ DEPT_CODE ที่ได้รับอนุญาต
// ถ้ามีสิทธิ์ 'ALL' ให้ข้ามการกรอง DEPT_CODE (เห็นทุกแผนก)
if ($param_c !== '') {
	if ($hasAllAccess) {
		// มีสิทธิ์ 'ALL' ไม่ต้องกรอง DEPT_CODE
		// ไม่ต้องเพิ่ม WHERE clause สำหรับ DEPT_CODE
	} else if (count($authorizedDeptCodes) > 0) {
		$inPlaceholders = implode(',', array_fill(0, count($authorizedDeptCodes), '?'));
		$sql .= "\n	  AND DEPT_CODE IN ($inPlaceholders)\n";
	} else {
		// ไม่มีสิทธิ์เห็นแผนกใด ๆ
		$sql .= "\n	  AND 1=0\n";
	}
}

$sql .= "	ORDER BY BR_CODE, DEPT_CODE, PRS_NO, TMR_DATE\n";

//echo $sql ;
// เตรียมพารามิเตอร์ให้สอดคล้องกับเงื่อนไข
$params = array($param_s, $param_e, $param_df);
// ถ้ามี br_code และไม่ใช่ 'ALL' ให้เพิ่ม br_code เป็นพารามิเตอร์แรก (หลัง param_df)
if ($param_br_code !== '' && strtoupper($param_br_code) !== 'ALL') {
	$params[] = $param_br_code;
} else if ($param_br_code !== '' && strtoupper($param_br_code) === 'ALL' && $param_c !== '') {
	// เมื่อ br_code=ALL และมี param_c ให้เพิ่ม BR_CODE ที่ได้รับอนุญาต
	if (!$hasAllBrAccess && count($authorizedBrCodes) > 0) {
		$params = array_merge($params, $authorizedBrCodes);
	}
}
// ถ้ามีสิทธิ์ 'ALL' ไม่ต้องเพิ่มพารามิเตอร์ DEPT_CODE
if ($param_c !== '' && !$hasAllAccess && count($authorizedDeptCodes) > 0) {
	$params = array_merge($params, $authorizedDeptCodes);
}

$stmt = sqlsrv_query($conn, $sql, $params);
if ($stmt === false) {
    $errors = sqlsrv_errors();
    error_log('SQL Query Error: ' . print_r($errors, true));
    sqlsrv_close($conn);
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    die('Error: Failed to execute query. Please check error log.');
}

// ------------------------------
// 4) จัดกลุ่มข้อมูลเป็น Branch -> Dept -> Emp -> Date
// ------------------------------
$data = [];

while ($row = sqlsrv_fetch_array($stmt, SQLSRV_FETCH_ASSOC)) {

    $brCode  = $row['BR_CODE'];
    $brName  = $row['BR_THAIDESC'];
    $dept    = $row['DEPT_CODE'];
    $deptNm  = $row['DEPT_THAIDESC'];
    $prs     = $row['PRS_NO'];
    $empName = trim($row['EMP_NAME'] . ' ' . $row['EMP_SURNME']);
    // TMR_DATE เป็น string จาก ReturnDatesAsStrings
    $dateStr = substr($row['TMR_DATE'], 0, 10);  // YYYY-MM-DD
    $otHour  = (float)$row['tmr_QTY_t'];

    // กำหนดชื่อสาขา
    if (!isset($data[$brCode])) {
        $data[$brCode] = [
            'name'  => $brName,
            'depts' => []
        ];
    }

    // กำหนดชื่อแผนก
    if (!isset($data[$brCode]['depts'][$dept])) {
        $data[$brCode]['depts'][$dept] = [
            'name' => $deptNm,
            'emps' => []
        ];
    }

    // กำหนดพนักงาน
// กำหนดพนักงาน
if (!isset($data[$brCode]['depts'][$dept]['emps'][$prs])) {
    // เตรียม array วันทั้งหมดให้เป็น null ก่อน
    $daysInit = [];
    foreach ($periodDates as $d) {
        $daysInit[$d] = null;   // null = ยังไม่มี OT วันนั้น
    }

    $data[$brCode]['depts'][$dept]['emps'][$prs] = [
        'emp_no'   => $prs,
        'emp_name' => $empName,
        'days'     => $daysInit,
        'total'    => 0
    ];
}

    // บันทึกชั่วโมง OT ของวันนั้น (df_code ที่ต้องการเท่านั้นอยู่แล้ว)
    if (isset($data[$brCode]['depts'][$dept]['emps'][$prs]['days'][$dateStr])) {
        // กรณีมีหลายแถวในวันเดียวกัน (เช่น split OT) ให้รวมชั่วโมง
        $cur = $data[$brCode]['depts'][$dept]['emps'][$prs]['days'][$dateStr];
        if ($cur === null) $cur = 0;
        $data[$brCode]['depts'][$dept]['emps'][$prs]['days'][$dateStr] = $cur + $otHour;
    } else {
        // เผื่อวันที่อยู่นอกช่วง (ปกติไม่ควรเกิด ถ้า param ถูก)
        $data[$brCode]['depts'][$dept]['emps'][$prs]['days'][$dateStr] = $otHour;
    }
}

// หลังจากใส่ทุกวันแล้ว คำนวณ total ต่อคน
foreach ($data as $brCode => &$brData) {
    foreach ($brData['depts'] as $deptCode => &$deptData) {
        foreach ($deptData['emps'] as $prs => &$empData) {
            $sum = 0;
            foreach ($empData['days'] as $d => $val) {
                if ($val !== null) {
                    $sum += $val;
                }
            }
            $empData['total'] = $sum;
        }
    }
}
unset($brData, $deptData, $empData);

// ------------------------------
// 5) สร้าง HTML สำหรับ TCPDF
// ------------------------------
// ไม่ต้องตั้งค่า margin ซ้ำ (ตั้งไว้แล้วด้านบน)
$pdf->AddPage('L', 'A4'); // เรียก AddPage() ที่นี่ครั้งเดียว พร้อม orientation

// Font
$pdf->SetFont('thsarabun', '', 12);
$pdf->SetY(40);

// ตรวจสอบว่ามีข้อมูลหรือไม่
if (empty($data)) {
	// ไม่พบข้อมูล ให้แสดงข้อความ
	$pdf->SetFont('thsarabun', '', 16);
	$pdf->SetTextColor(128, 128, 128); // สีเทา
	$noDataHtml = '
		<div style="text-align: center; padding: 50px;">
			<p style="font-size: 18pt; color: #808080;">ไม่พบข้อมูล</p>
		</div>
	';
	$pdf->writeHTML($noDataHtml, true, false, false, false, '');
	$pdf->Output('ot_summary.pdf', 'I');
	// ปิด connection
	if (isset($stmt) && $stmt !== false) {
		sqlsrv_free_stmt($stmt);
	}
	sqlsrv_close($conn);
	exit;
}
// $colWidth = 85.25;  // พื้นที่คอลัมน์วันที่รวม
// $dayColWidth = 2.65; // กว้างต่อวันให้สอดคล้องกับ Header

// เตรียมข้อมูลเดือน/ปี สำหรับ map 26..31 -> เดือนแรก และ 1..25 -> เดือนถัดไป
$startD = new DateTime($param_s);
$endD   = new DateTime($param_e);
$year1  = (int)$startD->format('Y');
$month1 = (int)$startD->format('m');
$year2  = (int)$endD->format('Y');
$month2 = (int)$endD->format('m');
$daysInMonth1 = cal_days_in_month(CAL_GREGORIAN, $month1, $year1);

// Style ของตารางหลัก
$tableStyle = '
<style>
    table.ot-report {
        border-collapse: collapse;
    }
    table.ot-report th,
    table.ot-report td {
        border: 0.3px solid #000;
        font-size: 11pt;
        text-align: center;
        padding: 2px;
    }
    table.ot-report td.text-left {
        text-align: left;
        border-top: 1px solid #000;
        border-left: 1px solid #000;
        border-right: 1px solid #000;
    }
    table.ot-report td.text-center {
        text-align: center;
        border-top: 1px solid #000;
    }
    .row-branch {
        background-color: #eeeeee;
        font-weight: bold;
        font-size: 16pt;
        border-left: 1px solid #000;
        border-right: 1px solid #000;

    }
    .row-dept {
        height: 21px;
        background-color: #f5f5f5;
        font-weight: bold;
    }
</style>
';

$html = $tableStyle;
$pdf ->SetY(31);
// วนทีละสาขา
foreach ($data as $brCode => $brData) {

    // แสดงหัวสาขา
    $html .= '<table width="102.08%">
        <tr class="row-branch">
            <td class="text-left" style="border-left: 1px solid #000;border-right: 1px solid #000;;border-top: 1px solid #000" colspan="'.(2 + count($periodDates) + 1).'">
                สาขา: '.$brCode.' - '.$brData['name'].'
            </td>
        </tr>
    </table>';

    // วนทีละแผนกในสาขา
    foreach ($brData['depts'] as $deptCode => $deptData) {

        $html .= '<table width="102.08%">
            <tr class="row-dept">
                <td class="text-left" style="border-right: 1px solid #000;border-left: 1px solid #000" colspan="'.(2 + count($periodDates) + 1).'">
                    แผนก: '.$deptCode.' - '.$deptData['name'].'
                </td>
            </tr>
        </table>';

        // ตารางพนักงานของแผนกนี้
        $html .= '<table class="ot-report" width="100%">
            <thead></thead>
            <tbody>';

        foreach ($deptData['emps'] as $emp) {
            $html .= '<tr nobr="true">';
            $html .= '<td class="text-center" width="5%">'.$emp['emp_no'].'</td>';
            $html .= '<td class="text-left" width="10%">'.$emp['emp_name'].'</td>';

            // 26..31 ของเดือนแรก
            for ($d = 26; $d <= 31; $d++) {
                $val = null;
                if ($d <= $daysInMonth1) {
                    $dateKey = sprintf('%04d-%02d-%02d', $year1, $month1, $d);
                    $val = isset($emp['days'][$dateKey]) ? $emp['days'][$dateKey] : null;
                }
                if ($val === null) {
                    $html .= '<td class="text-center" width="2.68%">-</td>';
                } else {
                    $html .= '<td class="text-center" width="2.68%"><span style="font-size: 9pt;">'.number_format($val, 2).'</span></td>';
                }
            }

            // 1..25 ของเดือนถัดไป
            for ($d = 1; $d <= 25; $d++) {
                $dateKey = sprintf('%04d-%02d-%02d', $year2, $month2, $d);
                $val = isset($emp['days'][$dateKey]) ? $emp['days'][$dateKey] : null;
                if ($val === null) {
                    $html .= '<td class="text-center" width="2.68%">-</td>';
                } else {
                    $html .= '<td class="text-center" width="2.68%"><span style="font-size: 9pt;">'.number_format($val, 2).'</span></td>';
                }
            }

            $html .= '<td width="4%" class="text-center"><span style="font-size: 9pt;">'.number_format($emp['total'], 2).'</span></td>';
            $html .= '</tr>';
        }

        $html .= '</tbody></table><br/>';
    }

    // ขึ้นหน้าใหม่ถ้าใกล้เต็ม (กันล้น)
    if ($pdf->GetY() > 180) {
        $pdf->AddPage();
    }
}

// แสดง HTML ลง TCPDF
$pdf->writeHTML($html, true, false, false, false, '');

$pdf->Output('ot_summary.pdf', 'I');

// ปิด connection
sqlsrv_free_stmt($stmt);
sqlsrv_close($conn);
