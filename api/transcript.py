from http.server import BaseHTTPRequestHandler
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.formatters import TextFormatter
import json
from urllib.parse import urlparse, parse_qs

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'application/json')
        self.end_headers()

        try:
            query = urlparse(self.path).query
            params = parse_qs(query)
            video_id = params.get('videoId', [None])[0]

            if not video_id:
                self.wfile.write(json.dumps({"error": "No videoId provided"}).encode('utf-8'))
                return

            # Fetch transcript
            # Note: Using standard YouTubeTranscriptApi static method which works on standard PyPI package
            transcript = YouTubeTranscriptApi.get_transcript(video_id)
            
            # Format to text
            formatter = TextFormatter()
            text = formatter.format_transcript(transcript)
            
            self.wfile.write(json.dumps({"transcript": text}).encode('utf-8'))
            
        except Exception as e:
            self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
