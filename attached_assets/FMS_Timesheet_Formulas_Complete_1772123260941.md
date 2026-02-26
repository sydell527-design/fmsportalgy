# FMS TIMESHEET FORMULAS & RULES - COMPLETE DOCUMENTATION

---

## TIME TIMESHEET (104 Employees)

### DROPDOWNS

**A14:A48 - Day Status:**
```
On Day, Off Day, Sick, Absent, Holiday, Annual Leave
```

**B14:B48 - Holiday Type:**
```
Holiday Double, Phagwah, Good Friday, Easter Monday, Labour Day, Christmas, Eid ul Azha
```

**J14:J48 - Locations:**
```
Unico, Unico-2, Unico-42, Unico-44, Unico-46, Unico-47, Unico-48, Unico-49, Globe, Globe-12, Hebrews, Romans-2, Beacon, Numbers, Zebra-24, Sunrise, Sunrise-1, Sunflower 6, Sunset 12, Ripple, Neptune P1, Neptune P2, Neptune P3, Neptune P4, Neptune P5, Neptune P6, Neptune P7, Rainbow 1, Rainbow 2, Citadel, Sunset 11, Autumn, Autumn-2, Miracle, Miracle 1, Canteen, Guard Hut
```

**O6 - Armed Status:**
```
Unarmed, Armed
```

**O7 - Client/Agency:**
```
Caricom, EU, UN, DMC, ARU, Head Office, Canteen
```

### FORMULAS

**E14 - Time Out (Auto-calculated based on Time In):**
```excel
=IF(D14="", "",
 IF(D14=TIME(0,0,0), 0,
 IF(AND(D14>=TIME(0,0,1), D14<=TIME(2,0,0)), TIME(7,0,0),
 IF(AND(D14>=TIME(6,0,0), D14<=TIME(8,0,0)), TIME(12,0,0),
 IF(AND(D14>TIME(8,0,0), D14<=TIME(13,59,0)), TIME(15,0,0),
 IF(AND(D14>=TIME(14,0,0), D14<=TIME(17,59,0)), TIME(21,0,0),
 IF(AND(D14>=TIME(18,0,0), D14<=TIME(21,59,0)), TIME(0,0,0),
 IF(AND(D14>=TIME(22,0,0), D14<=TIME(23,59,59)), TIME(7,0,0), ""))))))))
```

**Shift Mapping (TIME - starts 6 AM):**
| Time In | Time Out | Shift |
|---------|----------|-------|
| 12:01 AM - 2:00 AM | 7:00 AM | Night (late arrival) |
| 6:00 AM - 8:00 AM | 12:00 PM | Morning (on-time) |
| 8:01 AM - 1:59 PM | 3:00 PM | Morning (late) |
| 2:00 PM - 5:59 PM | 9:00 PM | Afternoon |
| 6:00 PM - 9:59 PM | 12:00 AM | Evening |
| 10:00 PM - 11:59 PM | 7:00 AM | Night |

**G14 - 2nd Time In (mirrors Time Out for split shift):**
```excel
=IF(AND(D14>=TIME(6,0,0),D14<=TIME(8,0,0)),E14,"")
```

**I14 - Total Hours:**
```excel
=ROUND(IF(OR(D14="",E14="",E14=0),0,IF(H14="",MOD(E14-D14,1)*24,MOD(H14-D14,1)*24)),2)
```
*Logic: If H (actual end time) is entered, use H-D. Otherwise use E-D.*

**M14 - Regular Hours:**
```excel
=MAX(0,V14-W14)
```

**N14 - Overtime Hours:**
```excel
=(IF(OR($C14="",$D14=""),0,
 IF(OR($A14="Holiday",$A15="Holiday"),
    IF(ISNUMBER(MATCH(TRIM($B14),{"Phagwah","Good Friday","Easter Monday","Labour Day","Christmas","Eid ul Azha","Romans-2","Globe-12","Neptune P1"},0)),0,$I14),
 IF(AND(NOT(OR($A14="Annual Leave",$A15="Annual Leave")),$A14="Off day"),$I14,
  MAX(0,$I14-$V14)
  ))))+W14
```

**O14 - Holiday Hours:**
```excel
=IF(AND(OR($A14="Holiday",$A15="Holiday"),
        ISNUMBER(MATCH(TRIM($B14),{"Phagwah","Good Friday","Easter Monday","Labour Day","Christmas","Eid ul Azha","Romans-2","Globe-12","Neptune P1"},0))),
   $I14,0)
```

**R14 - Meals (TIME - 6-7 AM, 2-3 PM, 6-7 PM, 10-11 PM shifts):**
```excel
=IF(OR($O$7="Canteen",$O$7="Head Office"),0,IF(OR($I14>0,$I15>0),
   IF( OR(
        AND($D14>=TIME(6,0,0),$D14<=TIME(7,0,0)),
        AND($D14>=TIME(14,0,0),$D14<=TIME(15,0,0)),
        AND($D14>=TIME(18,0,0),$D14<=TIME(19,0,0)),
        AND($D14>=TIME(22,0,0),$D14<=TIME(23,0,0)),
        AND($D15>=TIME(6,0,0),$D15<=TIME(7,0,0)),
        AND($D15>=TIME(14,0,0),$D15<=TIME(15,0,0)),
        AND($D15>=TIME(18,0,0),$D15<=TIME(19,0,0)),
        AND($D15>=TIME(22,0,0),$D15<=TIME(23,0,0))
      ),
      IF($I14>0,1,0),
      0
   ),
0))
```

### WEEKLY OVERTIME TRACKING (Carry Forward System)

**L11 - Carry Forward Hours (manual entry):**
Enter previous period's REGULAR hours for first week carry-over.

**U14 - Weekly Regular Available:**
```excel
=MAX(0,40-Y14)
```

**V14 - Original Regular:**
```excel
=IF(OR($C14="",$D14=""),0,
 IF(OR($A14="Holiday",$A15="Holiday"),0,
 IF(AND(NOT(OR($A14="Annual Leave",$A15="Annual Leave")),$A14="Off day"),0,
  IF($I14+$I15>=8,IF($I14>=8,8,$I14),$I14)
  )))
```

**W14 - Weekly OT Adjustment:**
```excel
=MAX(0,V14-U14)
```

**X14 - Week Start (Sunday):**
```excel
=IF(C14="","",C14-WEEKDAY(C14,1)+1)
```

**Y14 - Weekly Hours Before:**
```excel
=IF(X14=X14,$L$11,0)
```

---

## FIXED TIMESHEET (29 Employees)

### DROPDOWNS
*Same as TIME for A, B, O6, O7*

**J14:J48 - Locations:**
```
=LocationList (Named Range pointing to hidden _Locations sheet)
```
Contains same locations as TIME.

### FORMULAS

**E14 - Time Out (FIXED - starts 5 AM):**
```excel
=IF(D14="", "",
 IF(D14=TIME(0,0,0), 0,
 IF(AND(D14>=TIME(0,0,1), D14<=TIME(2,0,0)), TIME(7,0,0),
 IF(AND(D14>=TIME(5,0,0), D14<=TIME(8,0,0)), TIME(12,0,0),
 IF(AND(D14>TIME(8,0,0), D14<=TIME(13,59,0)), TIME(15,0,0),
 IF(AND(D14>=TIME(14,0,0), D14<=TIME(17,59,0)), TIME(21,0,0),
 IF(AND(D14>=TIME(18,0,0), D14<=TIME(21,59,0)), TIME(0,0,0),
 IF(AND(D14>=TIME(22,0,0), D14<=TIME(23,59,59)), TIME(7,0,0), ""))))))))
```

**Shift Mapping (FIXED - starts 5 AM):**
| Time In | Time Out | Shift |
|---------|----------|-------|
| 12:01 AM - 2:00 AM | 7:00 AM | Night (late arrival) |
| **5:00 AM** - 8:00 AM | 12:00 PM | Morning (on-time) |
| 8:01 AM - 1:59 PM | 3:00 PM | Morning (late) |
| 2:00 PM - 5:59 PM | 9:00 PM | Afternoon |
| 6:00 PM - 9:59 PM | 12:00 AM | Evening |
| 10:00 PM - 11:59 PM | 7:00 AM | Night |

**G14 - 2nd Time In:**
```excel
=E14
```

**I14 - Total Hours:**
```excel
=ROUND(IF(OR(D14="",E14="",E14=0),0,IF(H14="",MOD(E14-D14,1)*24,MOD(H14-D14,1)*24)),2)
```

**R14 - Meals (FIXED - 5-7 AM, 2-3 PM, 6-7 PM shifts):**
```excel
=IF(OR($O$7="Canteen",$O$7="Head Office"),0,IF(OR($I14>0,$I15>0),
   IF( OR(
        AND($D14>=TIME(5,0,0),$D14<=TIME(7,0,0)),
        AND($D14>=TIME(14,0,0),$D14<=TIME(15,0,0)),
        AND($D14>=TIME(18,0,0),$D14<=TIME(19,0,0)),
        AND($D15>=TIME(5,0,0),$D15<=TIME(7,0,0)),
        AND($D15>=TIME(14,0,0),$D15<=TIME(15,0,0)),
        AND($D15>=TIME(18,0,0),$D15<=TIME(19,0,0))
      ),
      IF($I14>0,1,0),
      0
   ),
0))
```

*M, N, O, U, V, W, X, Y formulas same as TIME*

---

## EXECUTIVE TIMESHEET (11 Employees)

### DROPDOWNS
*Same as FIXED*

### FORMULAS
**All formulas identical to FIXED** (5 AM morning start, same meals formula)

### ADDITIONAL COLUMNS (Payroll Summary)
- Column L (12): Incentive
- Column M (13): Station Allowance
- Column N (14): Gas Allowance
- Column O (15): Project Management Allowance

### UPLOAD SHEET INCOME CODES (11 per employee)
| Code | Maps To | Column |
|------|---------|--------|
| ANNLEAVE | Annual Leave | J |
| NR | Basic Hrs | D |
| OT1 | Hol Hrs | F |
| 80125 | Responsibilities | G |
| INCENTIVE | Incentive | O |
| MA | Meals | I |
| OT | Overtime | E |
| RA | Risk | H |
| STATIONALLOWANC | Station Allow | L |
| GAS | Gas Allow | M |
| PRVLED | Project Mgmt Allow | N |

---

## ADDITIONAL TIMESHEET (13 Employees)

### DROPDOWNS
*Same as TIME for A, B, O6, O7*

**J14:J48 - Locations:**
```
=LocationList (Named Range)
```

### FORMULAS

**E14 - Time Out (ADDITIONAL - starts 6 AM, same as TIME):**
```excel
=IF(D14="", "",
 IF(D14=TIME(0,0,0), 0,
 IF(AND(D14>=TIME(0,0,1), D14<=TIME(2,0,0)), TIME(7,0,0),
 IF(AND(D14>=TIME(6,0,0), D14<=TIME(8,0,0)), TIME(12,0,0),
 IF(AND(D14>TIME(8,0,0), D14<=TIME(13,59,0)), TIME(15,0,0),
 IF(AND(D14>=TIME(14,0,0), D14<=TIME(17,59,0)), TIME(21,0,0),
 IF(AND(D14>=TIME(18,0,0), D14<=TIME(21,59,0)), TIME(0,0,0),
 IF(AND(D14>=TIME(22,0,0), D14<=TIME(23,59,59)), TIME(7,0,0), ""))))))))
```

**G14 - 2nd Time In:**
```excel
=E14
```

**I14 - Total Hours:**
```excel
=ROUND(IF(OR(D14="",E14="",E14=0),0,IF(H14="",MOD(E14-D14,1)*24,MOD(H14-D14,1)*24)),2)
```

**R14 - Meals (ADDITIONAL - 6-7 AM, 2-3 PM, 6-7 PM shifts, NO 11 PM):**
```excel
=IF(OR($O$7="Canteen",$O$7="Head Office"),0,IF(OR($I14>0,$I15>0),
   IF( OR(
        AND($D14>=TIME(6,0,0),$D14<=TIME(7,0,0)),
        AND($D14>=TIME(14,0,0),$D14<=TIME(15,0,0)),
        AND($D14>=TIME(18,0,0),$D14<=TIME(19,0,0)),
        AND($D15>=TIME(6,0,0),$D15<=TIME(7,0,0)),
        AND($D15>=TIME(14,0,0),$D15<=TIME(15,0,0)),
        AND($D15>=TIME(18,0,0),$D15<=TIME(19,0,0))
      ),
      IF($I14>0,1,0),
      0
   ),
0))
```

*M, N, O, U, V, W, X, Y formulas same as TIME*

---

## KEY DIFFERENCES SUMMARY

| Feature | TIME | FIXED | EXECUTIVE | ADDITIONAL |
|---------|------|-------|-----------|------------|
| **Employees** | 104 | 29 | 11 | 13 |
| **Morning Start** | 6:00 AM | 5:00 AM | 5:00 AM | 6:00 AM |
| **Meals - Morning** | 6-7 AM | 5-7 AM | 5-7 AM | 6-7 AM |
| **Meals - 11 PM** | ✓ Yes | ✗ No | ✗ No | ✗ No |
| **Extra Allowances** | No | No | Yes (4 types) | No |
| **G Formula** | Split shift only | Always =E | Always =E | Always =E |

---

## BUSINESS RULES

### Shift Times (with 4-hour late accommodation)
1. **Morning Shift:** On-time 5/6-8 AM → 12 PM. Late 8:01 AM-1:59 PM → 3 PM
2. **Afternoon Shift:** 2-5:59 PM → 9 PM
3. **Evening Shift:** 6-9:59 PM → Midnight
4. **Night Shift:** 10-11:59 PM → 7 AM. Past midnight late 12:01-2 AM → 7 AM

### Overtime Rules
- Daily OT: Hours over 8 per day
- Weekly OT: Hours over 40 per week (tracked via carry forward system)
- Off Day work: All hours count as OT
- Holiday work: Goes to Holiday Hours (not OT) for specific holidays

### Holidays Recognized
```
Phagwah, Good Friday, Easter Monday, Labour Day, Christmas, Eid ul Azha
```

### Meals Rules
- No meals if Client = "Canteen" or "Head Office"
- 1 meal per qualifying shift (on-time arrival required)
- Qualifying shifts vary by timesheet type (see above)

### Weekly Reset
- Work week: Sunday to Saturday
- Carry Forward (L11): Enter previous period's regular hours
- Resets to fresh 40 hours when new Sunday begins
