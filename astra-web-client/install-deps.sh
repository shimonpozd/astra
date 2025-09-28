#!/bin/bash

echo "🚀 Установка зависимостей для Astra Web Client..."

# Установка основных зависимостей
echo "📦 Установка основных зависимостей..."
npm install

# Установка дополнительных зависимостей
echo "📦 Установка дополнительных зависимостей..."
npm install @radix-ui/react-slot @radix-ui/react-select next-themes lucide-react tailwindcss-animate

echo "✅ Все зависимости установлены!"
echo "🎯 Теперь можно запустить: npm run dev"