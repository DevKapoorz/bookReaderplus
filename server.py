"""
Flipbook Reader Backend Server
==============================
Serves static assets and provides REST API endpoints for saving and loading
annotations in history.json (zero external dependencies, fully compatible with Python 3.13+).
"""

import os
import sys
import json
import base64
import mimetypes
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import datetime

PORT = 8080
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HISTORY_FILE = os.path.join(BASE_DIR, 'history.json')
UPLOADS_DIR = os.path.join(BASE_DIR, 'uploads')

os.makedirs(UPLOADS_DIR, exist_ok=True)


def init_history_file():
    """Ensure history.json exists with valid structure."""
    if not os.path.exists(HISTORY_FILE):
        default_data = {
            "version": "1.0",
            "last_updated": datetime.now().isoformat(),
            "documents": {
                "default_book": {
                    "title": "The Art of Reading: A Bibliophile's Compendium",
                    "annotations": {}
                }
            }
        }
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(default_data, f, indent=2, ensure_ascii=False)


def load_history():
    init_history_file()
    try:
        with open(HISTORY_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"[Error] Failed to read {HISTORY_FILE}: {e}")
        return {"version": "1.0", "documents": {}}


def save_history(data):
    data["last_updated"] = datetime.now().isoformat()
    try:
        with open(HISTORY_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"[Error] Failed to write {HISTORY_FILE}: {e}")
        return False


class FlipbookRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def end_headers(self):
        # Enable CORS and caching rules
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # API: Get entire history or specific document annotations
        if path == '/api/history':
            history_data = load_history()
            query = parse_qs(parsed.query)
            doc_id = query.get('docId', [None])[0]

            if doc_id and doc_id in history_data.get('documents', {}):
                response_payload = {
                    "success": True,
                    "docId": doc_id,
                    "data": history_data['documents'][doc_id]
                }
            else:
                response_payload = {
                    "success": True,
                    "data": history_data
                }

            self.send_json_response(200, response_payload)
            return

        # API: Download history.json directly
        if path == '/api/history/download':
            history_data = load_history()
            content = json.dumps(history_data, indent=2).encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Disposition', 'attachment; filename="history.json"')
            self.send_header('Content-Length', str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return

        # API: List uploaded documents
        if path == '/api/documents':
            docs = []
            if os.path.exists(UPLOADS_DIR):
                for fname in sorted(os.listdir(UPLOADS_DIR)):
                    if fname.lower().endswith(('.pdf', '.json')):
                        fpath = os.path.join(UPLOADS_DIR, fname)
                        docs.append({
                            "name": fname,
                            "size": os.path.getsize(fpath),
                            "url": f"/uploads/{fname}"
                        })
            self.send_json_response(200, {"success": True, "documents": docs})
            return

        # Default static file handling
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # API: Save annotations to history.json
        if path == '/api/history':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_body = self.rfile.read(content_length)
                payload = json.loads(post_body.decode('utf-8'))

                doc_id = payload.get('docId', 'default_book')
                doc_title = payload.get('docTitle', doc_id)
                page_num = str(payload.get('pageNum', 1))
                page_annotations = payload.get('annotations', [])

                history = load_history()
                if 'documents' not in history:
                    history['documents'] = {}

                if doc_id not in history['documents']:
                    history['documents'][doc_id] = {
                        "title": doc_title,
                        "created_at": datetime.now().isoformat(),
                        "annotations": {}
                    }

                # Update page annotations
                history['documents'][doc_id]['title'] = doc_title
                history['documents'][doc_id]['annotations'][page_num] = {
                    "items": page_annotations,
                    "updated_at": datetime.now().isoformat(),
                    "count": len(page_annotations)
                }

                # Also support batch save if provided
                if 'allAnnotations' in payload and isinstance(payload['allAnnotations'], dict):
                    for p_num, p_annots in payload['allAnnotations'].items():
                        history['documents'][doc_id]['annotations'][str(p_num)] = {
                            "items": p_annots,
                            "updated_at": datetime.now().isoformat(),
                            "count": len(p_annots)
                        }

                saved = save_history(history)
                if saved:
                    self.send_json_response(200, {
                        "success": True,
                        "message": f"Saved annotations for {doc_id} (Page {page_num}) to history.json",
                        "timestamp": datetime.now().isoformat()
                    })
                else:
                    self.send_json_response(500, {"success": False, "error": "Disk write failure"})

            except Exception as e:
                self.send_json_response(400, {"success": False, "error": str(e)})
            return

        # API: Upload PDF file (Accepts JSON with base64 data or binary stream)
        if path == '/api/upload':
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                post_body = self.rfile.read(content_length)
                
                content_type = self.headers.get('Content-Type', '')
                if 'application/json' in content_type:
                    data = json.loads(post_body.decode('utf-8'))
                    fname = os.path.basename(data.get('filename', f'uploaded_{int(datetime.now().timestamp())}.pdf'))
                    file_b64 = data.get('base64', '')
                    file_bytes = base64.b64decode(file_b64)
                    
                    save_path = os.path.join(UPLOADS_DIR, fname)
                    with open(save_path, 'wb') as f:
                        f.write(file_bytes)

                    self.send_json_response(200, {
                        "success": True,
                        "filename": fname,
                        "url": f"/uploads/{fname}"
                    })
                    return
                else:
                    # Fallback binary save
                    query = parse_qs(parsed.query)
                    fname = os.path.basename(query.get('filename', [f'doc_{int(datetime.now().timestamp())}.pdf'])[0])
                    save_path = os.path.join(UPLOADS_DIR, fname)
                    with open(save_path, 'wb') as f:
                        f.write(post_body)

                    self.send_json_response(200, {
                        "success": True,
                        "filename": fname,
                        "url": f"/uploads/{fname}"
                    })
                    return
            except Exception as e:
                self.send_json_response(500, {"success": False, "error": str(e)})
            return

        self.send_json_response(404, {"success": False, "error": "Endpoint not found"})

    def send_json_response(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    init_history_file()
    server_address = ('', PORT)
    httpd = HTTPServer(server_address, FlipbookRequestHandler)
    print("=" * 60)
    print(f"📖 Flipbook Reader Server running at http://localhost:{PORT}")
    print(f"📁 Root directory: {BASE_DIR}")
    print(f"📝 History file:   {HISTORY_FILE}")
    print("Press Ctrl+C to stop.")
    print("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()


if __name__ == '__main__':
    main()
