from sanic import Sanic, response
from sanic.request import File
from sanic.log import logger
from sanic.response import json as sanic_json
from datetime import datetime, timedelta
import os
import uuid
import asyncio
import json
import shutil
import bcrypt
import jwt
from functools import wraps
from dotenv import load_dotenv
import asyncpg

# Load environment variables
load_dotenv()

# --- Configuration ---
app = Sanic("PN1")
THRESHOLD = 30
UPLOADS_DIR = "uploads"
JWT_SECRET = os.getenv("JWT_SECRET", "your_jwt_secret_key")

# Database configuration
DB_HOST = os.getenv("DB_HOST")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_PORT = os.getenv("DB_PORT", "6543")

# Path to the local ffmpeg binary
FFMPEG_PATH = os.path.join(os.getcwd(), "bin", "ffmpeg")

EMOTIONS = [
    "Surprised", "Excited", "Happy", "Content", "Relaxed",
    "Tired", "Bored", "Sad", "Neutral", "Scared", "Angry"
]

# --- Database Connection ---
async def get_db_connection():
    conn = await asyncpg.connect(
        host=DB_HOST,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD,
        port=DB_PORT
    )
    return conn

# --- Authentication Utilities ---
def hash_password(password):
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt())

def verify_password(password, hashed):
    return bcrypt.checkpw(password.encode(), hashed)

def generate_jwt(user_id):
    payload = {
        "user_id": user_id,
        "exp": datetime.utcnow() + timedelta(days=1)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def decode_jwt(token):
    try:
        decoded = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return decoded
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def auth_required(handler):
    @wraps(handler)
    async def wrapper(request, *args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return response.json({"error": "Authorization token required"}, status=401)

        token = auth_header.split(" ")[1]
        user = decode_jwt(token)
        if not user:
            return response.json({"error": "Invalid or expired token"}, status=401)

        request.ctx.user = user
        return await handler(request, *args, **kwargs)
    return wrapper

# --- Static Files ---
app.static("/", "./frontend/", name="frontend_static")
app.static("/uploads", "./uploads", name="uploads_static")

# --- DB Test ---
@app.get("/test-db")
async def test_db(request):
    try:
        conn = await get_db_connection()
        result = await conn.fetch("SELECT NOW()")
        await conn.close()
        return sanic_json({"status": "success", "time": str(result[0]["now"])})
    except Exception as e:
        return sanic_json({"status": "error", "message": str(e)})

# --- Authentication Endpoints ---
@app.post("/auth/register")
async def register(request):
    data = request.json
    required_fields = ["email", "password"]
    if not all(field in data for field in required_fields):
        return sanic_json({"error": "Missing fields"}, status=400)

    try:
        conn = await get_db_connection()
        user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", data["email"])
        if user:
            return sanic_json({"error": "Email already registered"}, status=409)

        hashed_password = hash_password(data["password"])
        await conn.execute(
            "INSERT INTO users (email, password) VALUES ($1, $2)",
            data["email"], hashed_password.decode()
        )
        await conn.close()
        return sanic_json({"message": "User registered successfully"})
    except Exception as e:
        return sanic_json({"error": str(e)}, status=500)

@app.post("/auth/login")
async def login(request):
    data = request.json
    email = data.get("email")
    password = data.get("password")

    try:
        conn = await get_db_connection()
        user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email)
        await conn.close()

        if not user or not verify_password(password, user["password"].encode()):
            return sanic_json({"error": "Invalid credentials"}, status=401)

        token = generate_jwt(user["email"])
        return sanic_json({"token": token})
    except Exception as e:
        return sanic_json({"error": str(e)}, status=500)

@app.get("/auth/check")
@auth_required
async def check_auth(request):
    return sanic_json({"user": request.ctx.user})

# --- Subscription Endpoints ---
@app.post("/subscribe")
@auth_required
async def subscribe(request):
    user_id = request.ctx.user["user_id"]
    try:
        conn = await get_db_connection()
        await conn.execute(
            """
            INSERT INTO subscriptions (user_id, is_active, start_date, end_date, payment_status)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id)
            DO UPDATE SET is_active = $2, start_date = $3, end_date = $4, payment_status = $5
            """,
            user_id, True, datetime.utcnow(), datetime.utcnow() + timedelta(days=30), "completed"
        )
        await conn.close()
        return sanic_json({"message": "Subscription activated successfully"})
    except Exception as e:
        return sanic_json({"error": str(e)}, status=500)

# --- Main Endpoints ---
@app.get("/")
async def serve_landing_page(request):
    return await response.file("./frontend/index.html")

@app.get("/pwa")
async def serve_pwa(request):
    return await response.file("./frontend/pwa.html")

def analyze_audio(audio_path: str) -> dict:
    # Placeholder for audio analysis
    return {EMOTIONS[i]: float(0) for i in range(len(EMOTIONS))}

# --- Helpers ---
async def run_async_cmd(*cmd):
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate()
    return proc.returncode, stdout.decode(), stderr.decode()

def save_uploaded_file(upload_dir: str, video_file: File) -> str:
    video_path = os.path.join(upload_dir, "video.mp4")
    with open(video_path, "wb") as f:
        f.write(video_file.body)
    return video_path

def save_combo_analysis(upload_dir: str, audio_emotions: dict, micro_path: str) -> str:
    with open(micro_path, "r") as f:
        micro_emotions = json.load(f)
    combo = {"audio_emotions": audio_emotions, "micro_emotions": micro_emotions}
    combo_path = os.path.join(upload_dir, "combo_analysis.json")
    with open(combo_path, "w") as f:
        json.dump(combo, f, indent=2)
    return combo_path

# --- Main Upload/Analyze Route ---
@app.post("/analyze")
async def analyze(request):
    video_file: File = request.files.get("video")
    if not video_file:
        return response.json({"error": "No video uploaded."}, status=400)

    upload_id = str(uuid.uuid4())[:8]
    upload_dir = os.path.join(UPLOADS_DIR, upload_id)
    frames_dir = os.path.join(upload_dir, "frames")
    os.makedirs(frames_dir, exist_ok=True)

    video_path = save_uploaded_file(upload_dir, video_file)

    # Extract frames
    retcode, _, stderr = await run_async_cmd(
        "python", "jobs/extract_diff_frames.py",
        video_path,
        frames_dir,
        "--threshold", str(THRESHOLD / 255.0),
        "--ffmpeg-path", FFMPEG_PATH
    )

    if retcode != 0:
        logger.error(f"Frame extraction error: {stderr}")
        return response.json({"error": "Frame extraction failed."}, status=500)

    # Extract audio using local ffmpeg binary
    audio_path = os.path.join(upload_dir, "audio.wav")
    retcode, _, stderr = await run_async_cmd(
        FFMPEG_PATH, "-y", "-i", video_path, "-vn", "-acodec", "pcm_s16le", audio_path
    )

    if retcode != 0:
        logger.error(f"Audio extraction error: {stderr}")
        return response.json({"error": "Audio extraction failed."}, status=500)

    # If the user is authenticated, save the video metadata to the database
    user_id = request.ctx.user.get("user_id") if hasattr(request.ctx, 'user') else None
    if user_id:
        try:
            conn = await get_db_connection()
            await conn.execute(
                "INSERT INTO videos (video_id, user_id, video_path) VALUES ($1, $2, $3)",
                upload_id, user_id, f"/uploads/{upload_id}/video.mp4"
            )
            await conn.close()
        except Exception as e:
            logger.error(f"Database error: {str(e)}")
            return response.json({"error": "Failed to save video metadata."}, status=500)

    return response.json({
        "status": "success",
        "upload_id": upload_id,
        "timestamp": datetime.now().isoformat(),
        "paths": {
            "video": f"/uploads/{upload_id}/video.mp4",
            "frames_dir": f"/uploads/{upload_id}/frames/",
            "audio": f"/uploads/{upload_id}/audio.wav",
        },
    })

# --- Supporting Routes ---
@app.get("/replay")
async def replay_page(request):
    return await response.file("./frontend/replay.html")

@app.get("/uploads_index.json")
# @auth_required
async def list_uploaded_sessions(request):
    user_id = request.ctx.user["user_id"]
    try:
        conn = await get_db_connection()
        videos = await conn.fetch("SELECT video_id, uploaded_at FROM videos WHERE user_id = $1", user_id)
        await conn.close()
        entries = [{
            "id": video["video_id"],
            "timestamp": video["uploaded_at"].timestamp()
        } for video in videos]
        entries.sort(key=lambda x: x["timestamp"], reverse=True)
        return sanic_json(entries)
    except Exception as e:
        return sanic_json({"error": str(e)}, status=500)

@app.post("/delete_video")
# @auth_required
async def delete_video(request):
    data = request.json
    upload_id = data.get("upload_id")
    if not upload_id:
        return response.json({"error": "Missing upload_id"}, status=400)

    path = os.path.join(UPLOADS_DIR, upload_id)
    if os.path.exists(path):
        shutil.rmtree(path)
        try:
            conn = await get_db_connection()
            await conn.execute("DELETE FROM videos WHERE video_id = $1", upload_id)
            await conn.close()
        except Exception as e:
            logger.error(f"Database error: {str(e)}")
            return response.json({"error": "Failed to delete video metadata."}, status=500)
        return response.json({"status": "deleted", "upload_id": upload_id})
    else:
        return response.json({"error": "Upload not found."}, status=404)

# --- Run ---
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=4200, debug=True, single_process=True)
