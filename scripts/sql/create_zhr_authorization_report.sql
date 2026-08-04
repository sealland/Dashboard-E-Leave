/*
  Report access ACL (module whitelist) — separate from DEPT/BR data scope.

  Rules:
  - No rows for a PRS_NO  → allow all reports (backward compatible)
  - REPORT_CODE = 'ALL'   → allow all reports
  - Otherwise             → only listed REPORT_CODE values

  REPORT_CODE values (match dashboard id):
    e-leave            Dashboard E-Leave
    time-attendance    Time Attendance (สถิติลา / OT / มาสาย)
    emc-report         HR Monthly Performance Dashboard
*/

IF OBJECT_ID(N'dbo.ZHR_AUTHORIZATION_REPORT', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.ZHR_AUTHORIZATION_REPORT (
    PRS_NO      NVARCHAR(50)  NOT NULL,
    REPORT_CODE NVARCHAR(50)  NOT NULL,
    CONSTRAINT PK_ZHR_AUTHORIZATION_REPORT PRIMARY KEY (PRS_NO, REPORT_CODE)
  );
END
GO

/* Example: give 57110047 only E-Leave + Time Attendance (no EMC)
DELETE FROM dbo.ZHR_AUTHORIZATION_REPORT WHERE PRS_NO = N'57110047';
INSERT INTO dbo.ZHR_AUTHORIZATION_REPORT (PRS_NO, REPORT_CODE) VALUES
  (N'57110047', N'e-leave'),
  (N'57110047', N'time-attendance');
*/

/* Example: executive — all reports via ALL
INSERT INTO dbo.ZHR_AUTHORIZATION_REPORT (PRS_NO, REPORT_CODE)
VALUES (N'23010002', N'ALL');
*/
