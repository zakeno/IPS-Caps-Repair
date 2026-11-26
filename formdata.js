/*
  Form wording and pre-filled answers. Edit this file to change defaults.
  on: true  -> the box is ticked
  r: remark text printed on the form
  field: filled in from the UTN screen ('product', 'expiry' or 'spec')
  The wording (including original spelling) follows form S2-CIV-CF-PFC-FRM-FGJV0008.
*/
var FORM = {
  no: 'S2-CIV-CF-PFC-FRM-FGJV0008',
  title1: 'SEGMENT REPAIR INSPECTION CHECKLIST',
  title2: 'SEGMENT REPAIR INSPECTION CHECKLIST (Photos)',
  repairType: 'Crack inducer cap repair',
  cms: 'S2-FGJV-TEC-CMS-0050_I',
  types: ['SC1', 'SC2', 'SC4', 'SC5', 'SC7', 'IPT'],
  locations: ['T.L', 'T.R', 'L.L', 'L.R'],
  sections: [
    {
      title: 'PRODUCT DETAIL',
      after: 'repairType',
      rows: [
        { t: '1. Confirm Product Name and batch', on: true, r: 'Master Builder 5488CI / SL 0646A01' },
        { t: '2. Review Data Sheet & SDS', on: true, r: 'Reviewed' },
        { t: '3. Check Expiry and Storage', on: true, field: 'expiry' },
        { t: '4. Verify Companion Products', on: true, r: 'Master Builder 1444 Part A and Part B' },
        { t: '5. Confirm Compatibility of Repair Material', on: true, r: 'Confirmed' },
        { t: '6. Verify Project Specification Requirements', on: true, r: 'ER-3.06.25 / SPC-2507' }
      ]
    },
    {
      title: 'PRE REPAIR',
      rows: [
        { t: '1. Area to received repair chipped back to good concrete?', on: true, r: 'Prepared and Checked' },
        { t: '2. Area to received repair clean?', on: true, r: 'Prepared as TDS requirements' },
        { t: '3. Area to received repair pre-wetted?', on: false, r: 'Not Applicable' },
        { t: '4. Bonding Agent Applied ? (if applicable)', on: true, r: 'Applied 1444 Part A and Part B' },
        { t: '5. Repair materials in satisfactory status and approved for use?', on: true, r: 'Satisfactory' },
        { t: '6. Support equipment available and in working order?', on: true, r: 'All in good working condition' },
        { t: '7. Formwork secures, in position and leak free? (if applicable)', on: false, r: 'Not Applicable' },
        { t: '8. Photos Taken?', on: true, r: 'Yes (see attached photo)' }
      ]
    },
    {
      title: 'IN PROGRESS REPAIR',
      rows: [
        { t: '1. Mixing of Material As per Manufacturer Recommendation?', on: true, r: 'As per TDS and S2-CIV-CF-PFC-WIN-FGJV0001' },
        { t: '2. Application of Material as Per Manufacturer Recommendation?', on: true, r: 'Confirmed and as per TDS requirements' },
        { t: '3. Coverage & Flow as per Manufacturer Recommendation?', on: true, r: 'Confirmed and as per TDS requirements' },
        { t: '4. Compaction (Dry Pack Grout if applicable)', on: false, r: 'Not Applicable' },
        { t: '5. Repair Material Leakage, Observed?', on: false, r: 'Not Applicable' },
        { t: '6. Sample Taken?', on: true, r: 'for compressive strength' },
        { t: '7. Photos Taken?', on: true, r: 'Yes (see attached photo)' }
      ]
    },
    {
      title: 'POST REPAIR CHECKS',
      rows: [
        { t: '1. Finish, Edges, Bond is/are Inspected?', on: true, r: 'Visual Inspection Completed see evidence as per attached Photo' },
        { t: '2. Cracking and Shrinkage is/are Observed?', on: false, r: 'No Cracking and Shrinkage are Observed' },
        { t: '3. Curing Time is/are Confirmed?', on: true, r: 'Concure A99' },
        { t: '4. Photos Before / During / After', on: true, r: 'Yes (see attached photo)' }
      ]
    }
  ]
};
if (typeof module !== 'undefined') module.exports = { FORM: FORM };
