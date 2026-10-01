# Future Excel import

Place a future one-time import script in this directory. It must map approved worksheets to programme codes, upsert students by `roll_no`, and upsert baselines by `(session_id, student_id)`.

Before writing anything, validate missing roll numbers/names, duplicate roll numbers, invalid or negative attendance, attendance above the programme's configured classes conducted, unexpected worksheets, empty rows, and inconsistent data types. Abort on validation errors; do not invent or silently correct data.
