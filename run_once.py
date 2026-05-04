from app import app, db, Admin
from werkzeug.security import generate_password_hash

with app.app_context():
    admin = Admin(
        username = "renz",          # ← change this
        password = generate_password_hash("Traced@SGOD")  # ← change this
    )
    db.session.add(admin)
    db.session.commit()
    print("Done!")