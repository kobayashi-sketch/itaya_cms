<?php
declare(strict_types=1);

require_once __DIR__ . '/auth.php';

ini_set('display_errors', '0');
ini_set('log_errors', '1');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    signage_json_response(['ok' => false, 'error' => 'Method not allowed'], 405);
}

signage_require_admin_post();

if (empty($_FILES['file']) || !is_array($_FILES['file'])) {
    signage_json_response(['ok' => false, 'error' => 'File is required'], 400);
}

$file = $_FILES['file'];
if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    signage_json_response(['ok' => false, 'error' => 'Upload failed'], 400);
}

$maxBytes = 50 * 1024 * 1024;
$size = (int) ($file['size'] ?? 0);
if ($size <= 0 || $size > $maxBytes) {
    signage_json_response(['ok' => false, 'error' => 'Invalid file size'], 400);
}

$originalName = signage_string($file['name'] ?? 'upload', 180);
$extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
$allowedExtensions = [
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'webp' => 'image/webp',
    'gif' => 'image/gif',
    'pdf' => 'application/pdf',
];
if (!isset($allowedExtensions[$extension])) {
    signage_json_response(['ok' => false, 'error' => 'Unsupported file type'], 400);
}

$tmpName = (string) ($file['tmp_name'] ?? '');
$finfo = new finfo(FILEINFO_MIME_TYPE);
$detectedType = $finfo->file($tmpName) ?: '';
$expectedType = $allowedExtensions[$extension];
if ($extension === 'pdf') {
    if ($detectedType !== 'application/pdf') {
        signage_json_response(['ok' => false, 'error' => 'Invalid PDF file'], 400);
    }
} elseif (!str_starts_with($detectedType, 'image/')) {
    signage_json_response(['ok' => false, 'error' => 'Invalid image file'], 400);
}

$uploadDir = __DIR__ . '/uploads';
if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) {
    signage_json_response(['ok' => false, 'error' => 'Failed to create upload directory'], 500);
}

$id = bin2hex(random_bytes(16));
$storedName = $id . '.' . $extension;
$targetPath = $uploadDir . '/' . $storedName;
if (!move_uploaded_file($tmpName, $targetPath)) {
    signage_json_response(['ok' => false, 'error' => 'Failed to save upload'], 500);
}

$media = [
    'id' => $id,
    'name' => $originalName !== '' ? $originalName : $storedName,
    'type' => $expectedType,
    'size' => $size,
    'assetUrl' => './uploads/' . $storedName,
    'createdAt' => date(DATE_ATOM),
];

$pageCount = signage_int_range($_POST['pageCount'] ?? 0, 1, 500, 0);
if ($extension === 'pdf' && $pageCount > 0) {
    $media['pageCount'] = $pageCount;
}

signage_json_response(['ok' => true, 'media' => $media]);
