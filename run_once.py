# run_once.py
from app import app, db, Admin
from werkzeug.security import generate_password_hash

with app.app_context():
    db.create_all()
    superadmin = Admin(
        username = "renz_super",       # ← set your username
        password = generate_password_hash("SGOD@urservice"),  # ← your own password
        role     = "superadmin",
    )
    db.session.add(superadmin)
    db.session.commit()
    print("Superadmin created!")