$lines = Get-Content -Path 'index.html' -Encoding UTF8
$out = [System.Collections.Generic.List[string]]::new()
$skip = $false
for ($i = 0; $i -lt $lines.Count; $i++) {
    $ln = $i + 1
    if ($ln -eq 393) {
        $out.Add('          </div>')
        $skip = $true
    }
    if ($ln -eq 512) {
        $skip = $false
    }
    if (-not $skip) {
        $out.Add($lines[$i])
    }
}
[System.IO.File]::WriteAllLines('index.html', $out, [System.Text.Encoding]::UTF8)
Write-Host "Done. Total lines: $($out.Count)"
