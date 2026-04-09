#!/usr/bin/env python3
"""
打包后优化脚本 - 清理不必要的文件以减小体积
"""
import os
import sys
import shutil
from pathlib import Path


def get_size(path):
    """获取目录或文件的大小"""
    if os.path.isfile(path):
        return os.path.getsize(path)
    total = 0
    for dirpath, dirnames, filenames in os.walk(path):
        for f in filenames:
            fp = os.path.join(dirpath, f)
            if os.path.exists(fp):
                total += os.path.getsize(fp)
    return total


def format_size(size):
    """格式化文件大小"""
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size < 1024:
            return f"{size:.2f} {unit}"
        size /= 1024
    return f"{size:.2f} TB"


def remove_files_by_pattern(directory, patterns, dry_run=False, whitelist=None):
    """根据模式删除文件"""
    removed = []
    whitelist = whitelist or []
    for root, dirs, files in os.walk(directory, topdown=False):
        for name in files:
            filepath = os.path.join(root, name)
            # 检查是否在白名单中
            if any(whitelist_pattern in name for whitelist_pattern in whitelist):
                continue
            for pattern in patterns:
                if pattern in name or name.endswith(pattern.lstrip('*')):
                    if not dry_run:
                        try:
                            os.remove(filepath)
                            removed.append(filepath)
                        except Exception as e:
                            print(f"  无法删除 {filepath}: {e}")
                    else:
                        removed.append(filepath)
                    break
    return removed


def remove_dirs_by_name(directory, names, dry_run=False):
    """根据目录名删除目录"""
    removed = []
    for root, dirs, files in os.walk(directory, topdown=False):
        for name in dirs:
            if name in names:
                dirpath = os.path.join(root, name)
                if not dry_run:
                    try:
                        shutil.rmtree(dirpath)
                        removed.append(dirpath)
                    except Exception as e:
                        print(f"  无法删除 {dirpath}: {e}")
                else:
                    removed.append(dirpath)
    return removed


def optimize_python_build(dist_python_dir):
    """优化 Python 构建目录"""
    print(f"\n{'='*60}")
    print(f"优化 Python 构建目录: {dist_python_dir}")
    print(f"{'='*60}")

    if not os.path.exists(dist_python_dir):
        print(f"目录不存在: {dist_python_dir}")
        return 0

    initial_size = get_size(dist_python_dir)
    print(f"初始大小: {format_size(initial_size)}")

    # 要删除的文件模式（不包含原生库）
    file_patterns = [
        '*.pyc', '*.pyo', '*.pyd',  # Python 编译文件
        '*.lib', '*.a',  # 静态库
        '*.h', '*.hpp', '*.c', '*.cpp',  # 源代码
        '*.txt', '*.md', '*.rst',  # 文档
        'LICENSE*', 'COPYING*', 'AUTHORS*', 'CHANGELOG*',
        'CHANGES*', 'NEWS*', 'TODO*', 'CONTRIBUTING*',
        'CODE_OF_CONDUCT*', 'SECURITY*', 'MANIFEST*',
        '*.map',  # Source map
        '*.ts', '*.tsx', '*.jsx',  # TypeScript/React 源文件
        '*.test.js', '*.test.ts', '*.test.tsx', '*.test.py',
        '*.spec.js', '*.spec.ts', '*.spec.tsx', '*.spec.py',
        'setup.py', 'setup.cfg', 'pyproject.toml',
        'requirements*.txt', 'Pipfile*', 'poetry.lock',
        'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
        '.gitignore', '.gitattributes', '.editorconfig',
        '.eslint*', '.prettier*', '.babel*',
        'webpack*.js', 'rollup*.js', 'vite*.js',
        'tsconfig*.json', 'jsconfig*.json',
        '*.ipynb',  # Jupyter notebooks
    ]
    
    # 原生库文件模式（需要特别处理）
    native_lib_patterns = ['*.so', '*.dylib', '*.dll']
    
    # 原生库白名单（保留必要的库）
    native_lib_whitelist = [
        # 核心依赖库
        'uvicorn', 'fastapi', 'pydantic', 'starlette',
        'requests', 'watchdog',
        # 系统相关库
        'python', 'libpython',
        # Windows 系统库
        'api-ms-win', 'kernel32', 'user32', 'gdi32', 'advapi32',
        'msvcp', 'vcruntime',
        # 其他可能需要的库
        'cryptography', 'ssl', 'zlib', 'sqlite3',
    ]

    # 要删除的目录名
    dir_names = [
        '__pycache__', '.pytest_cache', '.mypy_cache',
        'test', 'tests', 'testing',
        'doc', 'docs', 'documentation',
        'example', 'examples', 'demo', 'demos',
        'benchmark', 'benchmarks',
        'tutorials', 'notebooks',
        'types', 'typings', '@types',
        'node_modules',
        '.git', '.svn', '.hg',
    ]

    # 删除普通文件
    print("\n删除不必要的文件...")
    removed_files = remove_files_by_pattern(dist_python_dir, file_patterns)
    print(f"  删除了 {len(removed_files)} 个文件")
    
    # 处理原生库文件（使用白名单）
    print("\n清理不必要的原生库文件...")
    removed_native_libs = remove_files_by_pattern(
        dist_python_dir, 
        native_lib_patterns, 
        whitelist=native_lib_whitelist
    )
    print(f"  删除了 {len(removed_native_libs)} 个原生库文件")
    removed_files.extend(removed_native_libs)

    # 删除目录
    print("\n删除不必要的目录...")
    removed_dirs = remove_dirs_by_name(dist_python_dir, dir_names)
    print(f"  删除了 {len(removed_dirs)} 个目录")

    # 删除特定的测试相关目录
    print("\n清理测试相关文件...")
    test_patterns = ['*test*', '*Test*', '*TEST*', '*spec*', '*Spec*']
    for pattern in test_patterns:
        for root, dirs, files in os.walk(dist_python_dir, topdown=False):
            for d in dirs:
                if pattern.replace('*', '') in d.lower():
                    dirpath = os.path.join(root, d)
                    try:
                        shutil.rmtree(dirpath)
                        print(f"  删除测试目录: {dirpath}")
                    except Exception as e:
                        pass

    final_size = get_size(dist_python_dir)
    saved = initial_size - final_size
    print(f"\n优化完成!")
    print(f"最终大小: {format_size(final_size)}")
    print(f"节省空间: {format_size(saved)} ({saved/initial_size*100:.1f}%)")

    return saved


def optimize_electron_build(dist_electron_dir):
    """优化 Electron 构建目录"""
    print(f"\n{'='*60}")
    print(f"优化 Electron 构建目录: {dist_electron_dir}")
    print(f"{'='*60}")

    if not os.path.exists(dist_electron_dir):
        print(f"目录不存在: {dist_electron_dir}")
        return 0

    initial_size = get_size(dist_electron_dir)
    print(f"初始大小: {format_size(initial_size)}")

    # 要删除的文件模式
    file_patterns = [
        '*.map',  # Source map
        '*.md', '*.txt', '*.rst',  # 文档
        '.DS_Store', 'Thumbs.db',  # 系统文件
    ]

    # 删除文件
    print("\n删除不必要的文件...")
    removed_files = remove_files_by_pattern(dist_electron_dir, file_patterns)
    print(f"  删除了 {len(removed_files)} 个文件")

    final_size = get_size(dist_electron_dir)
    saved = initial_size - final_size
    print(f"\n优化完成!")
    print(f"最终大小: {format_size(final_size)}")
    print(f"节省空间: {format_size(saved)} ({saved/initial_size*100:.1f}%)")

    return saved


def main():
    """主函数"""
    print("="*60)
    print("Papyrus 打包优化工具")
    print("="*60)

    # 检查命令行参数
    dry_run = '--dry-run' in sys.argv
    if dry_run:
        print("\n[预览模式] 不会实际删除文件\n")

    # 优化 Python 构建
    dist_python = 'dist-python'
    python_saved = optimize_python_build(dist_python)

    # 优化 Electron 构建
    dist_electron = 'dist-electron'
    electron_saved = optimize_electron_build(dist_electron)

    # 总节省
    total_saved = python_saved + electron_saved
    print(f"\n{'='*60}")
    print(f"总计节省空间: {format_size(total_saved)}")
    print(f"{'='*60}")

    return 0


if __name__ == '__main__':
    sys.exit(main())
