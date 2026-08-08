<?php
declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('log_errors', '1');

const SIGNAGE_AUTH_KEY = 'itaya_signage_admin_authenticated';
const SIGNAGE_CSRF_KEY = 'itaya_signage_csrf_token';
const SIGNAGE_TOKEN_TTL = 43200;

function signage_auth_config(): array
{
    static $config = null;
    if (is_array($config)) {
        return $config;
    }

    $path = __DIR__ . '/auth-config.php';
    if (!is_file($path)) {
        $config = [];
        return $config;
    }

    $loaded = require $path;
    $config = is_array($loaded) ? $loaded : [];
    return $config;
}

function signage_admin_password_hash(): string
{
    $config = signage_auth_config();
    $hash = $config['admin_password_hash']
        ?? $config['SIGNAGE_ADMIN_PASSWORD_HASH']
        ?? getenv('SIGNAGE_ADMIN_PASSWORD_HASH')
        ?: '';
    return trim((string) $hash);
}

function signage_start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }

    session_name('itaya_signage_admin');
    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    session_start();
}

function signage_json_response(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function signage_is_authenticated(): bool
{
    signage_start_session();
    return !empty($_SESSION[SIGNAGE_AUTH_KEY]);
}

function signage_csrf_token(): string
{
    signage_start_session();
    if (empty($_SESSION[SIGNAGE_CSRF_KEY]) || !is_string($_SESSION[SIGNAGE_CSRF_KEY])) {
        $_SESSION[SIGNAGE_CSRF_KEY] = bin2hex(random_bytes(32));
    }
    return $_SESSION[SIGNAGE_CSRF_KEY];
}

function signage_token_secret(): string
{
    $passwordHash = signage_admin_password_hash();
    return hash('sha256', ($passwordHash !== '' ? $passwordHash : 'unconfigured') . __FILE__);
}

function signage_issue_token(): string
{
    $payload = [
        'iat' => time(),
        'nonce' => bin2hex(random_bytes(16)),
    ];
    $payloadJson = json_encode($payload, JSON_UNESCAPED_SLASHES);
    if ($payloadJson === false) {
        signage_json_response(['ok' => false, 'error' => 'Failed to issue token'], 500);
    }
    $payloadEncoded = rtrim(strtr(base64_encode($payloadJson), '+/', '-_'), '=');
    $signature = hash_hmac('sha256', $payloadEncoded, signage_token_secret());
    return $payloadEncoded . '.' . $signature;
}

function signage_verify_token(mixed $token): bool
{
    if (!is_string($token) || !str_contains($token, '.')) {
        return false;
    }
    [$payloadEncoded, $signature] = explode('.', $token, 2);
    $expected = hash_hmac('sha256', $payloadEncoded, signage_token_secret());
    if (!hash_equals($expected, $signature)) {
        return false;
    }
    $payloadJson = base64_decode(strtr($payloadEncoded, '-_', '+/'), true);
    if ($payloadJson === false) {
        return false;
    }
    $payload = json_decode($payloadJson, true);
    $issuedAt = is_array($payload) ? (int) ($payload['iat'] ?? 0) : 0;
    return $issuedAt > 0 && $issuedAt <= time() && (time() - $issuedAt) <= SIGNAGE_TOKEN_TTL;
}

function signage_require_admin_post(): void
{
    $sentToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (signage_verify_token($sentToken)) {
        return;
    }

    if (!signage_is_authenticated()) {
        signage_json_response(['ok' => false, 'error' => 'Authentication required'], 401);
    }

    if (!is_string($sentToken) || !hash_equals(signage_csrf_token(), $sentToken)) {
        signage_json_response(['ok' => false, 'error' => 'Invalid CSRF token'], 403);
    }
}

function signage_string(mixed $value, int $maxLength): string
{
    $text = trim((string) $value);
    $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $text) ?? '';
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $maxLength, 'UTF-8');
    }
    return substr($text, 0, $maxLength);
}

function signage_multiline_string(mixed $value, int $maxLength): string
{
    $text = str_replace(["\r\n", "\r"], "\n", trim((string) $value));
    $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $text) ?? '';
    $lines = array_values(array_filter(array_map('trim', explode("\n", $text)), static fn($line) => $line !== ''));
    $text = implode("\n", $lines);
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $maxLength, 'UTF-8');
    }
    return substr($text, 0, $maxLength);
}

function signage_bool(mixed $value): bool
{
    return $value === true;
}

function signage_int_range(mixed $value, int $min, int $max, int $fallback): int
{
    $number = filter_var($value, FILTER_VALIDATE_INT);
    if ($number === false) {
        return $fallback;
    }
    return min($max, max($min, $number));
}

function signage_date(mixed $value): string
{
    $text = signage_string($value, 10);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $text)) {
        return date('Y-m-d');
    }
    return $text;
}

function signage_time(mixed $value): string
{
    $text = signage_string($value, 5);
    if (!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $text)) {
        return '';
    }
    return $text;
}

function signage_layout(mixed $value, string $fallback = 'portrait'): string
{
    return $value === 'landscape' ? 'landscape' : $fallback;
}

function signage_marble_period(mixed $value): string
{
    $period = signage_string($value, 20);
    return in_array($period, ['morning', 'lunch', 'dinner'], true) ? $period : 'lunch';
}

function signage_media_list(mixed $items): array
{
    if (!is_array($items)) {
        return [];
    }

    $normalized = [];
    foreach (array_slice($items, 0, 100) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $id = signage_string($item['id'] ?? '', 80);
        $name = signage_string($item['name'] ?? '', 180);
        if ($id === '' || $name === '') {
            continue;
        }
        $media = [
            'id' => $id,
            'name' => $name,
            'type' => signage_string($item['type'] ?? 'application/octet-stream', 80),
            'size' => signage_int_range($item['size'] ?? 0, 0, 200 * 1024 * 1024, 0),
        ];
        if (!empty($item['assetUrl'])) {
            $assetUrl = signage_string($item['assetUrl'], 240);
            if (preg_match('#^\./(?:assets|uploads)/[A-Za-z0-9._~/%-]+$#', $assetUrl)) {
                $media['assetUrl'] = $assetUrl;
            }
        }
        if (!empty($item['createdAt'])) {
            $media['createdAt'] = signage_string($item['createdAt'], 40);
        }
        if (!empty($item['pageCount'])) {
            $media['pageCount'] = signage_int_range($item['pageCount'], 1, 500, 1);
        }
        if (signage_bool($item['isSample'] ?? false)) {
            $media['isSample'] = true;
        }
        $normalized[] = $media;
    }
    return $normalized;
}

function signage_events(mixed $items): array
{
    if (!is_array($items)) {
        return [];
    }

    $normalized = [];
    foreach (array_slice($items, 0, 1000) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $time = signage_time($item['time'] ?? '');
        $venue = signage_string($item['venue'] ?? '', 120);
        $location = signage_string($item['location'] ?? '', 60);
        $name = signage_multiline_string($item['name'] ?? '', 240);
        if ($time === '' || $venue === '' || $name === '') {
            continue;
        }
        $normalized[] = [
            'id' => signage_string($item['id'] ?? bin2hex(random_bytes(16)), 80),
            'date' => signage_date($item['date'] ?? ''),
            'visibleOnSignage' => signage_bool($item['visibleOnSignage'] ?? false),
            'time' => $time,
            'venue' => $venue,
            'location' => $location,
            'name' => $name,
        ];
    }
    return $normalized;
}

function signage_sanitize_state(array $state): array
{
    $slideSeconds = is_array($state['slideSeconds'] ?? null) ? $state['slideSeconds'] : [];
    $sanitized = [
        'adMedia' => signage_media_list($state['adMedia'] ?? []),
        'adLandscapeTop' => signage_media_list($state['adLandscapeTop'] ?? []),
        'adLandscapeBottom' => signage_media_list($state['adLandscapeBottom'] ?? []),
        'adLayout' => signage_layout($state['adLayout'] ?? '', 'portrait'),
        'ad2Media' => signage_media_list($state['ad2Media'] ?? []),
        'ad2LandscapeTop' => signage_media_list($state['ad2LandscapeTop'] ?? []),
        'ad2LandscapeBottom' => signage_media_list($state['ad2LandscapeBottom'] ?? []),
        'ad2Layout' => signage_layout($state['ad2Layout'] ?? '', 'portrait'),
        'marbleMedia' => signage_media_list($state['marbleMedia'] ?? []),
        'marbleLandscapeTop' => signage_media_list($state['marbleLandscapeTop'] ?? []),
        'marbleLandscapeBottom' => signage_media_list($state['marbleLandscapeBottom'] ?? []),
        'marbleLayout' => signage_layout($state['marbleLayout'] ?? '', 'landscape'),
        'marbleAdminPeriod' => signage_marble_period($state['marbleAdminPeriod'] ?? ''),
        'marbleLunchBadgeEnabled' => ($state['marbleLunchBadgeEnabled'] ?? true) !== false,
        'marbleLunchBadgeText' => signage_string($state['marbleLunchBadgeText'] ?? 'ランチタイム開催中', 40),
        'marbleSamplesInitialized' => signage_bool($state['marbleSamplesInitialized'] ?? false),
        'adSamplesInitialized' => signage_bool($state['adSamplesInitialized'] ?? false),
        'venueDisplayMode' => ($state['venueDisplayMode'] ?? '') === 'all' ? 'all' : 'auto',
        'venueEndedMode' => ($state['venueEndedMode'] ?? '') === 'hide' ? 'hide' : 'show',
        'venueTheme' => ($state['venueTheme'] ?? '') === 'dark' ? 'dark' : 'light',
        'venueDate' => signage_date($state['venueDate'] ?? ''),
        'adPortrait' => signage_media_list($state['adPortrait'] ?? []),
        'adLandscape' => signage_media_list($state['adLandscape'] ?? []),
        'slideSeconds' => [
            'ad' => signage_int_range($slideSeconds['ad'] ?? 5, 1, 120, 5),
            'ad2' => signage_int_range($slideSeconds['ad2'] ?? 5, 1, 120, 5),
            'marble' => signage_int_range($slideSeconds['marble'] ?? 5, 1, 120, 5),
            'venue' => signage_int_range($slideSeconds['venue'] ?? 5, 1, 120, 5),
            'adPortrait' => signage_int_range($slideSeconds['adPortrait'] ?? 5, 1, 120, 5),
            'adLandscape' => signage_int_range($slideSeconds['adLandscape'] ?? 5, 1, 120, 5),
        ],
        'events' => signage_events($state['events'] ?? []),
    ];

    foreach (['Morning', 'Lunch', 'Dinner'] as $suffix) {
        $sanitized["marble{$suffix}Layout"] = signage_layout($state["marble{$suffix}Layout"] ?? '', 'landscape');
        $sanitized["marble{$suffix}Media"] = signage_media_list($state["marble{$suffix}Media"] ?? []);
        $sanitized["marble{$suffix}LandscapeTop"] = signage_media_list($state["marble{$suffix}LandscapeTop"] ?? []);
        $sanitized["marble{$suffix}LandscapeBottom"] = signage_media_list($state["marble{$suffix}LandscapeBottom"] ?? []);
    }

    return $sanitized;
}
