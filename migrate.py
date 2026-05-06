from app import app, db
from sqlalchemy import text

with app.app_context():
    try:
        db.session.execute(text("""
            ALTER TABLE section_records
              ADD COLUMN IF NOT EXISTS hrd_title           VARCHAR(300),
              ADD COLUMN IF NOT EXISTS hrd_impl_date_start DATE,
              ADD COLUMN IF NOT EXISTS hrd_impl_date_end   DATE,
              ADD COLUMN IF NOT EXISTS hrd_venue           VARCHAR(300),
              ADD COLUMN IF NOT EXISTS hrd_participants_m  INTEGER,
              ADD COLUMN IF NOT EXISTS hrd_participants_f  INTEGER,
              ADD COLUMN IF NOT EXISTS hrd_eval_rating     NUMERIC(4,2),
              ADD COLUMN IF NOT EXISTS hrd_topic_matrix    TEXT;
        """))

        db.session.commit()
        print("HRD columns added successfully.")

        # Verify the columns exist
        result = db.session.execute(text("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = 'section_records'
              AND column_name LIKE 'hrd_%'
            ORDER BY column_name;
        """)).fetchall()

        print("HRD columns in section_records:")
        for row in result:
            print(f"  {row[0]}: {row[1]}")

    except Exception as e:
        db.session.rollback()
        print(f"Migration failed: {e}")