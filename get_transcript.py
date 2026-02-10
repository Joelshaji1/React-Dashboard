from youtube_transcript_api import YouTubeTranscriptApi
import sys
import json

def get_transcript(video_id):
    try:
        api = YouTubeTranscriptApi()
        transcript_obj = api.fetch(video_id)
        
        full_text = []
        
        # Try to iterate directly
        # If it yields objects with .text, use that
        # Or look at .snippets
        
        # Let's inspect the first item if iterable
        items = list(transcript_obj)
        if items:
            first = items[0]
            # print(dir(first)) # debug
            if hasattr(first, 'text'):
                full_text = [item.text for item in items]
            elif isinstance(first, dict) and 'text' in first:
                full_text = [item['text'] for item in items]
            else:
                # If structure is different, fail gracefully
                print(json.dumps({"error": "Unknown transcript item structure", "debug_item": str(first)}))
                return

        print(json.dumps({"transcript": " ".join(full_text)}))

    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    if len(sys.argv) > 1:
        video_id = sys.argv[1]
        get_transcript(video_id)
    else:
        print(json.dumps({"error": "No video ID provided"}))
