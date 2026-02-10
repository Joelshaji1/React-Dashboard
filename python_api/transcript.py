from http.server import BaseHTTPRequestHandler
from youtube_transcript_api import YouTubeTranscriptApi
from urllib.parse import urlparse, parse_qs
import json

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        video_id = query.get('videoId', [None])[0]

        if not video_id:
            self.send_response(400)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "No videoId provided"}).encode())
            return

        try:
            # Fetch transcript
            transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
            full_text = " ".join([item['text'] for item in transcript_list])

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"transcript": full_text}).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
            return
