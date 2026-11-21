# PyInstaller hook: keep only what the PDF parser actually needs.
# The upstream contrib hook collects all of pymupdf, including the ~50 MB
# layout/ONNX models and the mupdf-devel headers that this project never uses.
from PyInstaller.utils.hooks import collect_data_files

datas = collect_data_files(
    'pymupdf',
    excludes=[
        'layout/**',
        'mupdf-devel/**',
        '__pycache__/**',
        '**/__pycache__/**',
        '**/*.pyc',
    ],
)
