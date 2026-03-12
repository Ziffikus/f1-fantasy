# F1 Track SVGs herunterladen
# Ausfuehren in: C:\Users\strob\Desktop\f1 fantasy\f1-fantasy
# Rechtsklick auf PowerShell -> Als Administrator ausfuehren
# Dann: cd "C:\Users\strob\Desktop\f1 fantasy\f1-fantasy" && .\download_tracks.ps1

$base = "https://raw.githubusercontent.com/julesr0y/f1-circuits-svg/main/white"
$dest = "public\tracks"

New-Item -ItemType Directory -Force -Path $dest | Out-Null

$tracks = @{
    "australia"   = "albert_park"
    "china"       = "shanghai"
    "japan"       = "suzuka"
    "bahrain"     = "bahrain"
    "saudi"       = "jeddah"
    "miami"       = "miami"
    "canada"      = "montreal"
    "monaco"      = "monaco"
    "barcelona"   = "barcelona"
    "austria"     = "red_bull_ring"
    "britain"     = "silverstone"
    "belgium"     = "spa"
    "hungary"     = "hungaroring"
    "netherlands" = "zandvoort"
    "italy"       = "monza"
    "madrid"      = "madrid"
    "azerbaijan"  = "baku"
    "singapore"   = "marina_bay"
    "usa"         = "cota"
    "mexico"      = "mexico_city"
    "brazil"      = "interlagos"
    "lasvegas"    = "las_vegas"
    "qatar"       = "lusail"
    "abudhabi"    = "yas_marina"
}

foreach ($local in $tracks.Keys) {
    $remote = $tracks[$local]
    $url = "$base/$remote.svg"
    $file = "$dest\$local.svg"
    try {
        Invoke-WebRequest -Uri $url -OutFile $file -ErrorAction Stop
        Write-Host "OK  $local.svg"
    } catch {
        Write-Host "FEHLER $local ($remote): $_"
    }
}

Write-Host ""
Write-Host "Fertig! SVGs in $dest"
