from flask import Flask, render_template
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///database.db'
db = SQLAlchemy(app)

# class Expense(db.Model):
#     id = db.Column(db.Integer, primary_key=True)
#     amount = db.Column(db.Float)
#     description = db.Column(db.String(300))

# Navigation sections (used to generate routes and nav links)
SECTIONS = [
    {"id": "ces",  "label": "CES",  "full": "Chief Education Supervisor"},
    {"id": "eps",  "label": "EPS",  "full": "Education Program Supervisor"},
    {"id": "smme", "label": "SMME", "full": "School Management Monitoring and Evaluation"},
    {"id": "pr",   "label": "PR",   "full": "Planning and Research"},
    {"id": "hrd",  "label": "HRD",  "full": "Human Resource Development"},
    {"id": "yf",   "label": "YF",   "full": "Youth Formation"},
    {"id": "smn",  "label": "SMN",  "full": "Social Mobilization and Network"},
    {"id": "shn",  "label": "SHN",  "full": "School Health and Nutrition"},
    {"id": "drrm", "label": "DRRM", "full": "Disaster Risk Reduction Management"},
    {"id": "ef",   "label": "EF",   "full": "Education Facilities"},
]
 
@app.route("/")
def home():
    return render_template("home.html", sections=SECTIONS, active="home")
 
@app.route("/ces")
def ces():
    return render_template("ces.html", sections=SECTIONS, active="ces")
 
@app.route("/eps")
def eps():
    return render_template("eps.html", sections=SECTIONS, active="eps")
 
@app.route("/smme")
def smme():
    return render_template("smme.html", sections=SECTIONS, active="smme")
 
@app.route("/pr")
def pr():
    return render_template("pr.html", sections=SECTIONS, active="pr")
 
@app.route("/hrd")
def hrd():
    return render_template("hrd.html", sections=SECTIONS, active="hrd")
 
@app.route("/yf")
def yf():
    return render_template("yf.html", sections=SECTIONS, active="yf")
 
@app.route("/smn")
def smn():
    return render_template("smn.html", sections=SECTIONS, active="smn")
 
@app.route("/shn")
def shn():
    return render_template("shn.html", sections=SECTIONS, active="shn")
 
@app.route("/drrm")
def drrm():
    return render_template("drrm.html", sections=SECTIONS, active="drrm")
 
@app.route("/ef")
def ef():
    return render_template("ef.html", sections=SECTIONS, active="ef")
 
if __name__ == "__main__":
    app.run(debug=True)