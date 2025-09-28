import sys
import os
from PyPDF2 import PdfReader, PdfWriter

# Укажите путь к PDF файлу и папку для вывода прямо здесь
# Примеры правильных путей на Windows:
# pdf_file = r"C:\Users\pozdn\Desktop\example.pdf"
# output_dir = r"C:\Users\pozdn\Desktop\output_pages"
# Или с двойными слешами: "C:\\Users\\pozdn\\Desktop\\example.pdf"

pdf_file = r"E:\YandexDisk\YandexDisk\Roman_2025\ODEJDA\Pricetags\zakaz_258.pdf"  # Замените на путь к вашему PDF файлу
output_dir = r"E:\YandexDisk\YandexDisk\Roman_2025\ODEJDA\Pricetags\zakaz_258"  # Замените на желаемую папку для вывода

# Если аргументы командной строки переданы, использовать их вместо переменных выше
if len(sys.argv) >= 2:
    pdf_file = sys.argv[1]
if len(sys.argv) >= 3:
    output_dir = sys.argv[2]

# Create output directory if it doesn't exist
os.makedirs(output_dir, exist_ok=True)

try:
    reader = PdfReader(pdf_file)
    total_pages = len(reader.pages)

    # Извлекаем имя файла без расширения
    base_name = os.path.splitext(os.path.basename(pdf_file))[0]

    for page_num in range(total_pages):
        writer = PdfWriter()
        writer.add_page(reader.pages[page_num])
        output_file = os.path.join(output_dir, f"{base_name}_{page_num + 1}.pdf")
        with open(output_file, "wb") as f:
            writer.write(f)

    print(f"PDF split into {total_pages} pages in directory '{output_dir}'.")

except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
