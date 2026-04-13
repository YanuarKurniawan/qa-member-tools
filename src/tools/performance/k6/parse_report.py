import json

input_file = "report.log"
output_file = "parsed.jsonl"

with open(input_file, "r") as fin, open(output_file, "w") as fout:
    for line in fin:
        if 'msg="' not in line:
            continue
        try:
            raw = line.split('msg="')[1].rsplit('"', 1)[0]
            # Replace escaped quotes and backslashes
            unescaped = raw.encode('utf-8').decode('unicode_escape')
            parsed = json.loads(unescaped)
            fout.write(json.dumps(parsed) + '\n')
        except Exception as e:
            print(f"⚠️ Skipping line due to error: {e}")
