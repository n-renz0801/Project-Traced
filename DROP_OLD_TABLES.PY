from app import app, db
from sqlalchemy import text

with app.app_context():
    try:
        db.session.execute(text("DROP TABLE IF EXISTS ces_records"))
        db.session.execute(text("DROP TABLE IF EXISTS eps_records"))
        db.session.commit()
        print("Dropped ces_records and eps_records successfully.")
    except Exception as e:
        db.session.rollback()
        print(f"Failed: {e}")