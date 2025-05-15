# SEO Analyzer z optymalizacją AI

Narzędzie do analizy SEO z wykorzystaniem sztucznej inteligencji do optymalizacji treści.

## Instalacja

1. Sklonuj repozytorium:
```bash
git clone [url-repozytorium]
cd seo-analyzer
```

2. Zainstaluj zależności:
```bash
npm install
```

3. Skonfiguruj zmienne środowiskowe:
   - Utwórz plik `.env` w głównym katalogu projektu
   - Dodaj następujące zmienne:
   ```
   OPENAI_API_KEY=twój_klucz_api_tutaj
   MAX_CRAWL_DEPTH=10
   USER_AGENT=SEOAnalyzer/1.0
   TIMEOUT=10000
   ```

## Uzyskanie klucza API OpenAI

1. Zarejestruj się na stronie [OpenAI](https://platform.openai.com)
2. Przejdź do sekcji "API Keys"
3. Utwórz nowy klucz API
4. Skopiuj klucz i wklej go do pliku `.env`

## Użycie

Uruchom analizator z adresem URL strony:

```bash
npm start https://przykładowa-strona.pl
```

Możesz również określić maksymalną głębokość crawlowania:

```bash
npm start https://przykładowa-strona.pl 5
```

## Generowane raporty

Analizator generuje trzy pliki:
- `seo-report.html` - interaktywny raport HTML
- `seo-report.json` - dane w formacie JSON
- `seo-report.pdf` - raport w formacie PDF

## Funkcje AI

Moduł AI oferuje następujące funkcje:
- Optymalizacja tytułów stron
- Optymalizacja meta opisów
- Sugestie słów kluczowych
- Analiza treści pod kątem SEO

## Bezpieczeństwo

- Nigdy nie udostępniaj swojego klucza API
- Nie dodawaj pliku `.env` do repozytorium
- Używaj `.env.example` jako szablonu konfiguracji

## Wymagania

- Node.js 14+
- Klucz API OpenAI
- Dostęp do internetu 