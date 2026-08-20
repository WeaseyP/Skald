import os
import re
import sys
import glob

def check_citations(repo_root):
    docs_dir = os.path.join(repo_root, 'docs')
    if not os.path.exists(docs_dir):
        print(f"Docs directory not found: {docs_dir}")
        return 0
        
    md_files = glob.glob(os.path.join(docs_dir, '**', '*.md'), recursive=True)
    
    # Matches `path:NNN` or `path:NNN-NNN`
    # We will extract anything enclosed in backticks
    backtick_re = re.compile(r'`([^`]+)`')
    citation_re = re.compile(r'^([a-zA-Z0-9_/\.\-]+):(\d+)(?:-(\d+))?$')
    
    file_cache = {}
    warnings = 0
    
    for md_file in md_files:
        try:
            with open(md_file, 'r', encoding='utf-8') as f:
                lines = f.readlines()
        except UnicodeDecodeError:
            continue
            
        for line_num, line in enumerate(lines, 1):
            fragments = backtick_re.findall(line)
            if not fragments:
                continue
                
            citations = []
            quotes = []
            for frag in fragments:
                match = citation_re.match(frag)
                if match:
                    citations.append(match)
                else:
                    # Ignore very short quotes or generic terms
                    if len(frag.strip()) > 3:
                        quotes.append(frag.strip())
                    
            for cit in citations:
                filepath = cit.group(1)
                cited_line = int(cit.group(2))
                
                full_path = os.path.join(repo_root, filepath)
                if not os.path.exists(full_path):
                    # Try to find it by basename to handle relative paths gracefully
                    basename = os.path.basename(filepath)
                    found = False
                    for root_dir, dirs, files in os.walk(repo_root):
                        if '.git' in dirs: dirs.remove('.git')
                        if 'node_modules' in dirs: dirs.remove('node_modules')
                        if '.tools' in dirs: dirs.remove('.tools')
                        
                        if basename in files:
                            full_path = os.path.join(root_dir, basename)
                            found = True
                            break
                    if not found:
                        continue
                        
                if full_path not in file_cache:
                    try:
                        with open(full_path, 'r', encoding='utf-8') as src_f:
                            file_cache[full_path] = src_f.readlines()
                    except:
                        file_cache[full_path] = []
                        
                src_lines = file_cache[full_path]
                if not src_lines:
                    continue
                
                for quote in quotes:
                    best_diff = float('inf')
                    best_line = -1
                    
                    # Basic substring check for the quoted fragment in the source file
                    for i, s_line in enumerate(src_lines, 1):
                        if quote in s_line:
                            diff = abs(i - cited_line)
                            if diff < best_diff:
                                best_diff = diff
                                best_line = i
                                
                    if best_line != -1 and best_diff > 15:
                        print(f"{os.path.relpath(md_file, repo_root)}:{line_num} - Citation drift > 15 lines")
                        print(f"  Citation: {filepath}:{cited_line}")
                        print(f"  Quote: `{quote}` found at line {best_line} (diff {best_diff})")
                        print()
                        warnings += 1

    return warnings

if __name__ == '__main__':
    # Determine repo root from this script's location (assuming it's in scripts/)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.abspath(os.path.join(script_dir, '..'))
    
    print("Running citation drift checker...")
    w = check_citations(repo_root)
    if w > 0:
        print(f"Found {w} instances of citation drift.")
    else:
        print("No citation drift > 15 lines found.")
    
    # Advisory only: exit 0 so it doesn't break CI
    sys.exit(0)
