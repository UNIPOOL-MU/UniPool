"""
Configuration settings for UniPool backend.
Loads environment variables and defines application constants.
"""

import os
from datetime import timezone, timedelta
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "onboarding@resend.dev")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "UniPool")
GMAIL_ADDRESS = os.environ.get("GMAIL_ADDRESS", "")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")
SENDGRID_API_KEY = os.environ.get("SENDGRID_API_KEY", "")
SENDGRID_FROM_EMAIL = os.environ.get("SENDGRID_FROM_EMAIL", GMAIL_ADDRESS)
TURNSTILE_SECRET_KEY = os.environ.get("TURNSTILE_SECRET_KEY", "")

ADMIN_EMAILS = {e.strip().lower() for e in os.environ.get("ADMIN_EMAILS", "").split(",") if e.strip()} | {"utkarsh7023340530@gmail.com"}
DEFAULT_VERIFIED_SUFFIXES = (".edu", ".edu.in", ".ac.in")
VERIFIED_EMAIL_DOMAINS = {d.strip().lower() for d in os.environ.get("VERIFIED_EMAIL_DOMAINS", "").split(",") if d.strip()}

SEED_ADMIN_EMAIL = os.environ.get("SEED_ADMIN_EMAIL", "admin@unipool.app")
SEED_ADMIN_USERNAME = os.environ.get("SEED_ADMIN_USERNAME", "admin")
SEED_ADMIN_PASSWORD = os.environ.get("SEED_ADMIN_PASSWORD", "securepassword123")

VAPID_PUBLIC_KEY = os.environ.get("VAPID_PUBLIC_KEY", "")
VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", "")
VAPID_SUBJECT = os.environ.get("VAPID_SUBJECT", "mailto:admin@unipool.app")

MAX_OPEN_POOLS_PER_USER = int(os.environ.get("MAX_OPEN_POOLS_PER_USER", "5"))
MAX_POOLS_PER_HOUR = int(os.environ.get("MAX_POOLS_PER_HOUR", "10"))
SESSION_EXPIRE_DAYS = int(os.environ.get("SESSION_EXPIRE_DAYS", "7"))
ONLINE_THRESHOLD_SECONDS = int(os.environ.get("ONLINE_THRESHOLD_SECONDS", "60"))
TYPING_TTL_SECONDS = int(os.environ.get("TYPING_TTL_SECONDS", "4"))
IST = timezone(timedelta(hours=5, minutes=30))

ALLOWED_GAMES = {"tap-plane", "memory-match", "word-scramble", "rickshaw-rush", "trivia"}
LOWER_IS_BETTER = {"memory-match"}

COLLEGE_EMAIL_DOMAIN = "mahindrauniversity.edu.in"
ROLL_NUMBER_RE = __import__('re').compile(r"^([a-z]{2})(\d{2})([ump])([a-z]+)(\d{3})$")
SCHOOL_CODES = {"se": "School of Engineering", "sm": "School of Management", "sl": "School of Law"}
DEGREE_LEVEL_NAMES = {"u": "Undergraduate", "m": "Masters", "p": "PhD"}
BRANCH_CODES = {"cam": "Computational and Mathematics", "cse": "CSE", "ari": "Artificial Intelligence", "cie": "Civil Engineering"}

# A deliberately broad pool: every trivia request samples a fresh subset.
# Keep questions self-contained so the game can run offline once fetched.
TRIVIA_QUESTIONS = [
    {"q": "The Konkan Railway primarily runs along which coast of India?", "options": ["East Coast", "West Coast", "Northern Plains", "Deccan Plateau"], "answer": 1},
    {"q": "The Palace on Wheels luxury train is strongly associated with which state?", "options": ["Kerala", "Rajasthan", "Assam", "Goa"], "answer": 1},
    {"q": "Bengaluru's international airport is named after which historical figure?", "options": ["Rajiv Gandhi", "Kempegowda", "Sardar Patel", "Chhatrapati Shivaji"], "answer": 1},
    {"q": "India's first metro railway began operations in which city?", "options": ["Delhi", "Mumbai", "Kolkata", "Chennai"], "answer": 2},
    {"q": "The Vande Bharat Express is best described as a?", "options": ["Steam train", "Diesel train", "Semi-high-speed electric train", "Maglev train"], "answer": 2},
    {"q": "The Chenab Rail Bridge is located in which region?", "options": ["Uttarakhand", "Himachal Pradesh", "Jammu & Kashmir", "Sikkim"], "answer": 2},
    {"q": "The Nilgiri Mountain Railway is associated with which hill station?", "options": ["Darjeeling", "Ooty", "Shimla", "Matheran"], "answer": 1},
    {"q": "Which city is home to Chhatrapati Shivaji Maharaj Terminus?", "options": ["Mumbai", "Pune", "Nagpur", "Surat"], "answer": 0},
    {"q": "Which Indian city is famous for the Howrah Bridge?", "options": ["Kolkata", "Patna", "Lucknow", "Ranchi"], "answer": 0},
    {"q": "Which city is the main gateway to the Taj Mahal?", "options": ["Agra", "Jaipur", "Delhi", "Varanasi"], "answer": 0},
    {"q": "The Golden Temple is located in which city?", "options": ["Amritsar", "Ludhiana", "Chandigarh", "Jalandhar"], "answer": 0},
    {"q": "Which city is known as the Pink City?", "options": ["Udaipur", "Jodhpur", "Jaipur", "Bikaner"], "answer": 2},
    {"q": "Which city is commonly called the City of Lakes in Rajasthan?", "options": ["Jaisalmer", "Udaipur", "Ajmer", "Kota"], "answer": 1},
    {"q": "Which city is popularly known as the City of Nawabs?", "options": ["Lucknow", "Kanpur", "Agra", "Prayagraj"], "answer": 0},
    {"q": "Which Indian city is famous for Marine Drive?", "options": ["Mumbai", "Goa", "Kochi", "Chennai"], "answer": 0},
    {"q": "Which city is the capital of Rajasthan?", "options": ["Jodhpur", "Jaipur", "Udaipur", "Ajmer"], "answer": 1},
    {"q": "Which state is home to the backwaters around Alappuzha?", "options": ["Tamil Nadu", "Kerala", "Goa", "Karnataka"], "answer": 1},
    {"q": "Which city is famous for the Gateway of India monument?", "options": ["Mumbai", "Delhi", "Kolkata", "Pune"], "answer": 0},
    {"q": "Which desert covers much of western Rajasthan?", "options": ["Gobi", "Thar", "Kalahari", "Atacama"], "answer": 1},
    {"q": "Which Indian state is famous for the hill station Munnar?", "options": ["Kerala", "Sikkim", "Himachal Pradesh", "Meghalaya"], "answer": 0},
    {"q": "Which hill station is famous for the Toy Train on the Kalka–Shimla route?", "options": ["Shimla", "Manali", "Mussoorie", "Nainital"], "answer": 0},
    {"q": "Which city is home to the Meenakshi Amman Temple?", "options": ["Madurai", "Chennai", "Coimbatore", "Thanjavur"], "answer": 0},
    {"q": "Which city is famous for the Charminar?", "options": ["Hyderabad", "Bengaluru", "Aurangabad", "Vijayawada"], "answer": 0},
    {"q": "Which airport serves Hyderabad?", "options": ["Rajiv Gandhi International Airport", "Kempegowda International Airport", "Cochin International Airport", "Sardar Vallabhbhai Patel International Airport"], "answer": 0},
    {"q": "Which airport serves Delhi?", "options": ["Indira Gandhi International Airport", "Chaudhary Charan Singh Airport", "Safdarjung Airport", "Palam Airport"], "answer": 0},
    {"q": "Which city is home to Kempegowda International Airport?", "options": ["Mysuru", "Bengaluru", "Mangaluru", "Hubballi"], "answer": 1},
    {"q": "Which Indian airport is located near Kochi?", "options": ["Cochin International Airport", "Calicut International Airport", "Trivandrum International Airport", "Kannur International Airport"], "answer": 0},
    {"q": "Which airline has historically used the Maharaja as its mascot?", "options": ["Air India", "IndiGo", "SpiceJet", "Akasa Air"], "answer": 0},
    {"q": "Which airline is known for its blue-and-orange livery and is India's largest domestic airline by market share?", "options": ["IndiGo", "Air India", "SpiceJet", "Vistara"], "answer": 0},
    {"q": "Which Indian railway zone has its headquarters in Mumbai?", "options": ["Western Railway", "Northern Railway", "East Coast Railway", "South Central Railway"], "answer": 0},
    {"q": "Which railway station is associated with the phrase 'Chhatrapati Shivaji Maharaj Terminus'?", "options": ["Mumbai CSMT", "New Delhi", "Howrah", "Chennai Central"], "answer": 0},
    {"q": "Which train connects New Delhi and Varanasi as a Vande Bharat service?", "options": ["New Delhi–Varanasi Vande Bharat", "Deccan Queen", "Rajdhani Express", "Golden Temple Mail"], "answer": 0},
    {"q": "Which city is famous for the Darjeeling Himalayan Railway?", "options": ["Darjeeling", "Gangtok", "Siliguri", "Kalimpong"], "answer": 0},
    {"q": "Which state is home to Darjeeling?", "options": ["West Bengal", "Sikkim", "Assam", "Bihar"], "answer": 0},
    {"q": "Which state is home to the famous beaches of Goa?", "options": ["Goa", "Kerala", "Maharashtra", "Odisha"], "answer": 0},
    {"q": "Which city is often called India's Silicon Valley?", "options": ["Bengaluru", "Hyderabad", "Pune", "Chennai"], "answer": 0},
    {"q": "Which city is known as the Pearl City?", "options": ["Hyderabad", "Kochi", "Surat", "Jaipur"], "answer": 0},
    {"q": "Which city is famous for the Dal Lake?", "options": ["Srinagar", "Leh", "Shimla", "Dehradun"], "answer": 0},
    {"q": "Which union territory is home to Leh?", "options": ["Ladakh", "Jammu & Kashmir", "Chandigarh", "Puducherry"], "answer": 0},
    {"q": "Which city is the capital of Himachal Pradesh?", "options": ["Shimla", "Dharamshala", "Manali", "Kullu"], "answer": 0},
    {"q": "Which city is famous for the Rock Garden created by Nek Chand?", "options": ["Chandigarh", "Delhi", "Jaipur", "Bhopal"], "answer": 0},
    {"q": "Which city is famous for the Victoria Memorial?", "options": ["Kolkata", "Mumbai", "Delhi", "Chennai"], "answer": 0},
    {"q": "Which monument in Delhi is a UNESCO World Heritage Site and a tall red sandstone minaret complex?", "options": ["Qutub Minar", "India Gate", "Lotus Temple", "Purana Qila"], "answer": 0},
    {"q": "Which city is home to the Lotus Temple?", "options": ["Delhi", "Noida", "Jaipur", "Agra"], "answer": 0},
    {"q": "Which city is famous for the ghats along the Ganges and the Kashi Vishwanath Temple?", "options": ["Varanasi", "Patna", "Haridwar", "Rishikesh"], "answer": 0},
    {"q": "Which city is a major gateway to the Andaman and Nicobar Islands?", "options": ["Port Blair", "Kochi", "Visakhapatnam", "Chennai"], "answer": 0},
    {"q": "Which state is famous for Kaziranga National Park?", "options": ["Assam", "Odisha", "West Bengal", "Bihar"], "answer": 0},
    {"q": "Which state is famous for the Konark Sun Temple?", "options": ["Odisha", "Gujarat", "Tamil Nadu", "Karnataka"], "answer": 0},
    {"q": "Which city is famous for the Mysore Palace?", "options": ["Mysuru", "Bengaluru", "Hampi", "Belagavi"], "answer": 0},
    {"q": "Which historical site in Karnataka is famous for the Virupaksha Temple and ruins?", "options": ["Hampi", "Badami", "Mysuru", "Coorg"], "answer": 0},
    {"q": "Which Indian state is famous for the Hornbill Festival?", "options": ["Nagaland", "Manipur", "Mizoram", "Tripura"], "answer": 0},
    {"q": "Which city is famous for the Howrah Junction railway station?", "options": ["Kolkata", "Bhubaneswar", "Guwahati", "Ranchi"], "answer": 0},
    {"q": "Which city is known for the Sabarmati Ashram?", "options": ["Ahmedabad", "Vadodara", "Surat", "Rajkot"], "answer": 0},
]
