import os
import sys
import subprocess
import time
import webbrowser

ROOT_DIR = os.path.abspath(os.path.dirname(__file__))


def start():
    print("=" * 70)
    print("  BURGERSFLOW PINN STUDIO - STARTING PLATFORM")
    print("  Scientific Platform for Viscous Burgers Equation with RI-PINN")
    print("=" * 70)

    # 1. Check Python
    py_exe = sys.executable

    # 2. Seed database
    print("\n[1/3] Ensuring Database & Benchmark Baselines are Seeded...")
    seed_script = os.path.join(ROOT_DIR, "scripts", "seed_db.py")
    subprocess.run([py_exe, seed_script], check=True, cwd=ROOT_DIR)

    # 3. Start FastAPI Backend
    print("\n[2/3] Launching FastAPI Backend on http://localhost:8000 ...")
    api_cmd = [py_exe, "-m", "uvicorn", "apps.api.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
    api_process = subprocess.Popen(api_cmd, cwd=ROOT_DIR)

    # Give API a moment to bind
    time.sleep(2)

    # 4. Start Web UI (Vite dev server)
    print("\n[3/3] Launching Vite Frontend on http://localhost:3000 ...")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"
    web_dir = os.path.join(ROOT_DIR, "apps", "web")
    web_process = subprocess.Popen([npm_cmd, "run", "dev"], cwd=web_dir)

    print("\n" + "=" * 70)
    print("  BurgersFlow PINN Studio is LIVE!")
    print("  -> Web Application: http://localhost:3000")
    print("  -> API Gateway:     http://localhost:8000")
    print("  -> OpenAPI Docs:    http://localhost:8000/docs")
    print("  Press Ctrl+C to stop both servers.")
    print("=" * 70 + "\n")

    try:
        api_process.wait()
        web_process.wait()
    except KeyboardInterrupt:
        print("\nShutting down BurgersFlow servers...")
        api_process.terminate()
        web_process.terminate()
        print("Shutdown complete.")


if __name__ == "__main__":
    start()
