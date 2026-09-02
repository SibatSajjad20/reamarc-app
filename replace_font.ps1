Get-ChildItem -Path "$PSScriptRoot/src" -Recurse -Include *.tsx,*.jsx |
ForEach-Object {
    $path = $_.FullName
    $content = Get-Content -Raw $path
    $new = $content -replace 'font-mono','font-numeric'
    Set-Content -Path $path -Value $new
}
