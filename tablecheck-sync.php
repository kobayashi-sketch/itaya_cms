<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

ini_set('display_errors', '0');
ini_set('log_errors', '1');

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

const TABLECHECK_API_BASE = 'https://api.tablecheck.com/api/crm/v1';
const TABLECHECK_CACHE_TTL = 600;
$dataDir = __DIR__ . '/data';
$stateFile = $dataDir . '/tablecheck-state.json';
$logFile = $dataDir . '/tablecheck-updates.log';

function tablecheck_json(array $payload, int $statusCode = 200): never
{
    http_response_code($statusCode);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function tablecheck_read_config(): array
{
    $path = __DIR__ . '/tablecheck-config.php';
    if (!is_file($path)) {
        return [];
    }

    $raw = trim((string) file_get_contents($path));
    $loaded = null;
    if (str_starts_with($raw, '<?php')) {
        ob_start();
        $loaded = require $path;
        ob_end_clean();
    }

    if (is_array($loaded)) {
        return $loaded;
    }
    if (is_string($loaded) && trim($loaded) !== '') {
        return ['secret_key' => trim($loaded)];
    }

    $text = trim(preg_replace('/^<\?php\s*/', '', $raw) ?? $raw);
    $text = trim($text, " \t\n\r\0\x0B;'\"");
    if (preg_match('/(?:secret_key|api_key)\s*[=:]\s*[\'"]?([^\'";\s]+)/i', $raw, $match)) {
        $text = trim($match[1]);
    }
    return $text !== '' ? ['secret_key' => $text] : [];
}

function tablecheck_config_value(array $config, string $key, mixed $fallback = null): mixed
{
    return $config[$key] ?? $config[strtoupper($key)] ?? $fallback;
}

function tablecheck_secret(array $config): string
{
    return trim((string) (
        tablecheck_config_value($config, 'secret_key')
        ?? tablecheck_config_value($config, 'api_key')
        ?? tablecheck_config_value($config, 'production_api_key')
        ?? ''
    ));
}

function tablecheck_array_value(array $config, string $key): array
{
    $value = tablecheck_config_value($config, $key, []);
    if (is_string($value) && trim($value) !== '') {
        return array_values(array_filter(array_map('trim', explode(',', $value))));
    }
    if (!is_array($value)) {
        return [];
    }
    return array_values(array_filter(array_map(static fn($item) => trim((string) $item), $value)));
}

function tablecheck_date(string $value): string
{
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) ? $value : date('Y-m-d');
}

function tablecheck_iso_at(string $date, string $time): string
{
    return $date . 'T' . $time . ':00+09:00';
}

function tablecheck_get_path(array $item, array $paths): mixed
{
    foreach ($paths as $path) {
        $cursor = $item;
        foreach (explode('.', $path) as $part) {
            if (is_array($cursor) && array_key_exists($part, $cursor)) {
                $cursor = $cursor[$part];
                continue;
            }
            $cursor = null;
            break;
        }
        if ($cursor !== null && $cursor !== '') {
            return $cursor;
        }
    }
    return '';
}

function tablecheck_is_list(array $array): bool
{
    $index = 0;
    foreach (array_keys($array) as $key) {
        if ($key !== $index) {
            return false;
        }
        $index += 1;
    }
    return true;
}

function tablecheck_text(mixed $value, int $maxLength): string
{
    if (is_array($value)) {
        if (isset($value['ja'])) {
            $value = $value['ja'];
        } elseif (isset($value['en'])) {
            $value = $value['en'];
        } elseif (isset($value['name'])) {
            $value = $value['name'];
        } elseif (isset($value['label'])) {
            $value = $value['label'];
        } elseif (isset($value['title'])) {
            $value = $value['title'];
        }
    }
    if (is_array($value)) {
        $value = implode(', ', array_filter(array_map(static function ($item): string {
            if (is_array($item)) {
                return tablecheck_text($item['name_translations'] ?? $item['name'] ?? $item['label'] ?? $item['title'] ?? '', 120);
            }
            return (string) $item;
        }, $value)));
    }
    $text = trim((string) $value);
    $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $text) ?? '';
    return function_exists('mb_substr') ? mb_substr($text, 0, $maxLength, 'UTF-8') : substr($text, 0, $maxLength);
}

function tablecheck_string_list(mixed $value, int $maxItems = 20): array
{
    if (!is_array($value)) {
        $text = tablecheck_text($value, 120);
        return $text !== '' ? [$text] : [];
    }
    $items = [];
    foreach (array_slice($value, 0, $maxItems) as $item) {
        $text = tablecheck_text($item, 120);
        if ($text !== '') {
            $items[] = $text;
        }
    }
    return array_values(array_unique($items));
}

function tablecheck_datetime_parts(mixed $value): array
{
    $text = trim((string) $value);
    if ($text === '') {
        return ['', ''];
    }
    try {
        $date = new DateTimeImmutable($text);
        $date = $date->setTimezone(new DateTimeZone('Asia/Tokyo'));
        return [$date->format('Y-m-d'), $date->format('H:i')];
    } catch (Throwable) {
        if (preg_match('/^(\d{4}-\d{2}-\d{2}).*?(\d{1,2}:\d{2})/', $text, $match)) {
            return [$match[1], str_pad($match[2], 5, '0', STR_PAD_LEFT)];
        }
    }
    return ['', ''];
}

function tablecheck_extract_items(array $decoded): array
{
    foreach (['reservations', 'reservation_flags', 'items', 'data', 'results'] as $key) {
        if (isset($decoded[$key]) && is_array($decoded[$key])) {
            return tablecheck_is_list($decoded[$key]) ? $decoded[$key] : tablecheck_extract_items($decoded[$key]);
        }
    }
    return tablecheck_is_list($decoded) ? $decoded : [];
}

function tablecheck_is_cancelled(array $item): bool
{
    $status = strtolower(tablecheck_text(tablecheck_get_path($item, ['status', 'state', 'booking_status', 'reservation_status']), 80));
    return str_contains($status, 'cancel') || str_contains($status, 'キャンセル');
}

function tablecheck_event_from_reservation(array $item, array $flagNames = []): ?array
{
    if (tablecheck_is_cancelled($item)) {
        return null;
    }

    $startsAt = tablecheck_get_path($item, ['start_at', 'starts_at', 'reservation_start_at', 'booking_start_at', 'visit_at', 'datetime']);
    [$date, $time] = tablecheck_datetime_parts($startsAt);
    if ($date === '') {
        $date = tablecheck_text(tablecheck_get_path($item, ['date', 'start_date', 'visit_date']), 10);
    }
    if ($time === '') {
        $time = tablecheck_text(tablecheck_get_path($item, ['time', 'start_time', 'visit_time']), 5);
    }
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) || !preg_match('/^\d{2}:\d{2}$/', $time)) {
        return null;
    }

    $venue = tablecheck_text(tablecheck_get_path($item, [
        'table.name',
        'table',
        'tables',
        'room_name',
        'room.name',
        'room',
        'section.name',
        'section',
        'shop.name',
        'shop_slug',
    ]), 120);
    $name = tablecheck_text(tablecheck_get_path($item, [
        'group_name',
        'party_name',
        'booking_name',
        'reservation_name',
        'company_name',
        'guest.company',
        'guest.name',
        'customer.company',
        'customer.name',
        'name',
    ]), 240);
    $location = tablecheck_text(tablecheck_get_path($item, [
        'location',
        'floor',
        'shop.name',
    ]), 60);
    $status = tablecheck_text(tablecheck_get_path($item, ['status', 'state', 'booking_status', 'reservation_status']), 80);
    $pax = tablecheck_text(tablecheck_get_path($item, ['pax', 'pax_adult', 'party_size', 'covers']), 20);
    $flagIds = tablecheck_string_list(tablecheck_get_path($item, ['reservation_flag_ids', 'flag_ids', 'flags']), 50);
    $flags = array_values(array_filter(array_map(
        static fn($flagId): string => $flagNames[$flagId] ?? $flagId,
        $flagIds
    )));

    if ($venue === '' || $name === '') {
        return null;
    }

    $id = tablecheck_text(tablecheck_get_path($item, ['id', 'reservation_id', 'uuid']), 80);
    if ($id === '') {
        $id = hash('sha256', $date . '|' . $time . '|' . $venue . '|' . $name);
    }

    return [
        'id' => 'tablecheck-' . $id,
        'source' => 'tablecheck',
        'date' => $date,
        'visibleOnSignage' => true,
        'time' => $time,
        'venue' => $venue,
        'location' => $location,
        'name' => $name,
        'pax' => $pax,
        'status' => $status,
        'flagIds' => $flagIds,
        'flags' => $flags,
    ];
}

function tablecheck_request_path(string $secret, string $path, array $query = []): array
{
    $url = TABLECHECK_API_BASE . $path;
    if ($query) {
        $url .= '?' . http_build_query($query);
    }
    $headers = [
        'Accept: application/json',
        'Authorization: ' . $secret,
        'X-TableCheck-API-Key: ' . $secret,
    ];

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 25,
            CURLOPT_HTTPHEADER => $headers,
        ]);
        $body = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = curl_error($ch);
        curl_close($ch);
        if ($body === false || $status < 200 || $status >= 300) {
            throw new RuntimeException($error !== '' ? $error : 'TableCheck API returned HTTP ' . $status);
        }
        $decoded = json_decode($body, true);
    } else {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => 25,
                'header' => implode("\r\n", $headers),
            ],
        ]);
        $body = file_get_contents($url, false, $context);
        if ($body === false) {
            throw new RuntimeException('TableCheck API request failed');
        }
        $decoded = json_decode($body, true);
    }

    if (!is_array($decoded)) {
        throw new RuntimeException('TableCheck API response is not JSON');
    }
    return $decoded;
}

function tablecheck_request(string $secret, array $query): array
{
    return tablecheck_request_path($secret, '/reservations', $query);
}

function tablecheck_reservation_flag_names(string $secret): array
{
    try {
        $decoded = tablecheck_request_path($secret, '/reservation_flags', ['per_page' => 100, 'page' => 0]);
    } catch (Throwable) {
        return [];
    }
    $items = tablecheck_extract_items($decoded);
    $names = [];
    foreach ($items as $item) {
        if (!is_array($item)) {
            continue;
        }
        $id = tablecheck_text(tablecheck_get_path($item, ['id', 'reservation_flag_id']), 80);
        $name = tablecheck_text(tablecheck_get_path($item, ['name_translations', 'name', 'label', 'title']), 120);
        if ($id !== '' && $name !== '') {
            $names[$id] = $name;
        }
    }
    return $names;
}

function tablecheck_sync(): array
{
    global $dataDir, $stateFile, $logFile;

    $config = tablecheck_read_config();
    $secret = tablecheck_secret($config);
    if ($secret === '') {
        throw new RuntimeException('TableCheck API key is not configured');
    }

    $days = max(1, min(31, (int) tablecheck_config_value($config, 'days', 7)));
    $startDate = tablecheck_date((string) ($_GET['date'] ?? date('Y-m-d')));
    $end = new DateTimeImmutable($startDate, new DateTimeZone('Asia/Tokyo'));
    $end = $end->modify('+' . $days . ' days');

    $baseQuery = [
        'start_at_min' => tablecheck_iso_at($startDate, '00:00'),
        'start_at_max' => $end->format('Y-m-d') . 'T00:00:00+09:00',
        'per_page' => 100,
    ];

    $flagNames = tablecheck_reservation_flag_names($secret);
    $events = [];
    $requestCount = 0;
    for ($page = 0; $page < 20; $page += 1) {
        $requestCount += 1;
        $decoded = tablecheck_request($secret, $baseQuery + ['page' => $page]);
        $items = tablecheck_extract_items($decoded);
        foreach ($items as $item) {
            if (!is_array($item)) {
                continue;
            }
            $event = tablecheck_event_from_reservation($item, $flagNames);
            if ($event) {
                $events[$event['id']] = $event;
            }
        }
        if (count($items) < 100) {
            break;
        }
    }

    $events = array_values($events);
    usort($events, static fn($a, $b) => [$a['date'], $a['time'], $a['venue']] <=> [$b['date'], $b['time'], $b['venue']]);

    $payload = [
        'ok' => true,
        'source' => 'tablecheck',
        'syncedAt' => date(DATE_ATOM),
        'startDate' => $startDate,
        'days' => $days,
        'requestCount' => $requestCount,
        'flagCount' => count($flagNames),
        'events' => $events,
    ];

    if (!is_dir($dataDir) && !mkdir($dataDir, 0755, true)) {
        throw new RuntimeException('Failed to create data directory');
    }
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false || file_put_contents($stateFile, $json, LOCK_EX) === false) {
        throw new RuntimeException('Failed to write TableCheck cache');
    }
    $logLine = json_encode([
        'time' => date(DATE_ATOM),
        'remoteAddr' => $_SERVER['REMOTE_ADDR'] ?? 'cli',
        'events' => count($events),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($logLine !== false) {
        file_put_contents($logFile, $logLine . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
    return $payload;
}

function tablecheck_read_cache(): array
{
    global $stateFile;
    if (!is_file($stateFile)) {
        return ['ok' => true, 'source' => 'tablecheck', 'syncedAt' => '', 'events' => []];
    }
    $decoded = json_decode((string) file_get_contents($stateFile), true);
    return is_array($decoded) ? $decoded : ['ok' => true, 'source' => 'tablecheck', 'syncedAt' => '', 'events' => []];
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'CLI';
    if (PHP_SAPI === 'cli') {
        tablecheck_json(tablecheck_sync());
    }
    if ($method === 'POST') {
        signage_require_admin_post();
        tablecheck_json(tablecheck_sync());
    }
    if ($method === 'GET') {
        $forceSync = ($_GET['sync'] ?? '') === '1';
        $cacheIsStale = !is_file($stateFile) || (time() - filemtime($stateFile)) > TABLECHECK_CACHE_TTL;
        if ($forceSync && $cacheIsStale) {
            tablecheck_json(tablecheck_sync());
        }
        tablecheck_json(tablecheck_read_cache());
    }
    tablecheck_json(['ok' => false, 'error' => 'Method not allowed'], 405);
} catch (Throwable $error) {
    $cache = tablecheck_read_cache();
    $cache['ok'] = false;
    $cache['error'] = $error->getMessage();
    tablecheck_json($cache, 200);
}
