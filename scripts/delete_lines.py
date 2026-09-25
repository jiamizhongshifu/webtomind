import sys

def delete_lines(file_path, start_line, end_line):
    with open(file_path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # Lines are 1-indexed, so we delete lines[start_line - 1 : end_line]
    del lines[start_line - 1:end_line]
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(lines)

if __name__ == '__main__':
    delete_lines(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]))
