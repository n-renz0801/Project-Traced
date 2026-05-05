from app import app, db
from sqlalchemy import text

with app.app_context():
    try:
        # Create all tables that don't exist yet (including section_records)
        db.create_all()
        print("Tables created/verified.")

        # Check counts before migrating
        ces_count = db.session.execute(text("SELECT COUNT(*) FROM ces_records")).scalar()
        eps_count = db.session.execute(text("SELECT COUNT(*) FROM eps_records")).scalar()
        print(f"Found {ces_count} CES records and {eps_count} EPS records to migrate.")

        db.session.execute(text("""
            INSERT INTO section_records (section, code, process, school, date_received, status, date_completed, processing_days, remarks)
            SELECT 'ces', code, process, school, date_received, status, date_completed, processing_days, remarks
            FROM ces_records
        """))

        db.session.execute(text("""
            INSERT INTO section_records (section, code, process, school, date_received, status, date_completed, processing_days, remarks)
            SELECT 'eps', code, process, school, date_received, status, date_completed, processing_days, remarks
            FROM eps_records
        """))

        db.session.commit()

        # Verify
        result = db.session.execute(text(
            "SELECT section, COUNT(*) as count FROM section_records GROUP BY section"
        )).fetchall()
        print("Migration successful! section_records now contains:")
        for row in result:
            print(f"  {row[0]}: {row[1]} records")

    except Exception as e:
        db.session.rollback()
        print(f"Migration failed: {e}")