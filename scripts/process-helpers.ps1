function Get-TrackedProcessMap([string]$Path) {
    $Result = @{}
    foreach ($Line in @(Get-Content -LiteralPath $Path -ErrorAction Stop)) {
        if ($Line -notmatch '^(backend|frontend)=([1-9][0-9]*)$') {
            throw "Invalid tracked PID record in $Path. Run dev-down only after reviewing the file."
        }
        if ($Result.ContainsKey($Matches[1])) {
            throw "Duplicate tracked PID record '$($Matches[1])' in $Path."
        }
        $Result[$Matches[1]] = [int]$Matches[2]
    }
    if ($Result.Count -ne 2 -or -not $Result.ContainsKey('backend') -or -not $Result.ContainsKey('frontend')) {
        throw "Tracked PID file must contain exactly backend and frontend records: $Path"
    }
    return $Result
}

function Test-ProcessAlive([int]$Id) {
    return $null -ne (Get-Process -Id $Id -ErrorAction SilentlyContinue)
}

function Get-ParentProcessId([int]$Id) {
    if ($IsWindows) {
        $Process = Get-CimInstance Win32_Process -Filter "ProcessId = $Id" -ErrorAction SilentlyContinue
        if ($null -eq $Process) { return 0 }
        return [int]$Process.ParentProcessId
    }
    $Process = Get-Process -Id $Id -ErrorAction SilentlyContinue
    if ($null -eq $Process -or $null -eq $Process.Parent) { return 0 }
    return [int]$Process.Parent.Id
}

function Test-ProcessBelongsToTree([int]$ProcessId, [int]$RootId) {
    $Current = $ProcessId
    $Visited = @{}
    while ($Current -gt 0 -and -not $Visited.ContainsKey($Current)) {
        if ($Current -eq $RootId) { return $true }
        $Visited[$Current] = $true
        $Current = Get-ParentProcessId -Id $Current
    }
    return $false
}

function Test-PrivateLanIPv4Address([string]$Address) {
    if ($Address -notmatch '^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$') { return $false }
    $Parsed = $null
    if (-not [System.Net.IPAddress]::TryParse($Address, [ref]$Parsed) -or
        $Parsed.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or
        $Parsed.ToString() -ne $Address) {
        return $false
    }
    $Bytes = $Parsed.GetAddressBytes()
    return $Bytes[0] -eq 10 -or
        ($Bytes[0] -eq 172 -and $Bytes[1] -ge 16 -and $Bytes[1] -le 31) -or
        ($Bytes[0] -eq 192 -and $Bytes[1] -eq 168)
}

function Get-ActiveHostIPv4Candidates {
    $Result = @()
    foreach ($Interface in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
        if ($Interface.OperationalStatus -ne [System.Net.NetworkInformation.OperationalStatus]::Up -or
            $Interface.NetworkInterfaceType -in @(
                [System.Net.NetworkInformation.NetworkInterfaceType]::Loopback,
                [System.Net.NetworkInformation.NetworkInterfaceType]::Tunnel
            )) { continue }
        $Properties = $Interface.GetIPProperties()
        $HasDefaultGateway = @($Properties.GatewayAddresses | Where-Object {
            $null -ne $_.Address -and
            $_.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
            $_.Address.ToString() -ne '0.0.0.0'
        }).Count -gt 0
        foreach ($Unicast in $Properties.UnicastAddresses) {
            if ($Unicast.Address.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork) { continue }
            $Result += [pscustomobject]@{
                Address = $Unicast.Address.ToString()
                InterfaceName = $Interface.Name
                HasDefaultGateway = $HasDefaultGateway
            }
        }
    }
    return @($Result)
}

function Resolve-LanIPv4Address([string]$RequestedAddress = '', [object[]]$Candidates = $null) {
    if ($null -eq $Candidates) { $Candidates = @(Get-ActiveHostIPv4Candidates) }
    $Usable = @($Candidates | Where-Object { Test-PrivateLanIPv4Address -Address ([string]$_.Address) })
    if (-not [string]::IsNullOrWhiteSpace($RequestedAddress)) {
        if (-not (Test-PrivateLanIPv4Address -Address $RequestedAddress)) {
            throw "LanAddress must be a valid private LAN IPv4 address; loopback, link-local, wildcard, multicast, and public addresses are rejected."
        }
        if (@($Usable | Where-Object { ([string]$_.Address) -eq $RequestedAddress }).Count -eq 0) {
            throw "LanAddress $RequestedAddress is not owned by an active host interface."
        }
        return $RequestedAddress
    }
    $Preferred = @($Usable | Where-Object { $_.HasDefaultGateway })
    if ($Preferred.Count -eq 1) { return [string]$Preferred[0].Address }
    if ($Preferred.Count -gt 1) {
        throw "Multiple active private LAN addresses have a default gateway; specify -LanAddress explicitly."
    }
    if ($Usable.Count -eq 1) { return [string]$Usable[0].Address }
    if ($Usable.Count -eq 0) { throw "No active private LAN IPv4 address was found." }
    throw "Multiple active private LAN addresses were found; specify -LanAddress explicitly."
}

function Get-ListeningProcessIds([int]$Port, [string]$LocalAddress = '') {
    if ($IsWindows) {
        $Connections = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
        if ($LocalAddress) { $Connections = @($Connections | Where-Object { $_.LocalAddress -eq $LocalAddress }) }
        return @($Connections |
            Select-Object -ExpandProperty OwningProcess -Unique)
    }
    $Lsof = Get-Command lsof -ErrorAction SilentlyContinue
    if ($null -eq $Lsof) {
        throw "Cannot verify ownership of port $Port because lsof is unavailable."
    }
    $Selector = if ($LocalAddress) { "-iTCP@${LocalAddress}:$Port" } else { "-iTCP:$Port" }
    $Output = @(& $Lsof.Source -nP -t $Selector '-sTCP:LISTEN' 2>$null)
    if ($LASTEXITCODE -notin @(0, 1)) {
        throw "lsof failed while checking port $Port (exit $LASTEXITCODE)."
    }
    return @($Output | Where-Object { $_ -match '^[0-9]+$' } | ForEach-Object { [int]$_ } | Select-Object -Unique)
}

function Test-PortOwnedByTree([int]$Port, [int]$RootId, [string]$LocalAddress = '') {
    $Owners = @(Get-ListeningProcessIds -Port $Port -LocalAddress $LocalAddress)
    if ($Owners.Count -eq 0) { return $false }
    foreach ($Owner in $Owners) {
        if (Test-ProcessBelongsToTree -ProcessId $Owner -RootId $RootId) { return $true }
    }
    return $false
}

function Stop-ProcessTreeGracefully([int]$Id, [int]$GraceSeconds = 5) {
    $ForcedCount = 0
    $Children = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $null -ne $_.Parent -and $_.Parent.Id -eq $Id
    })
    foreach ($Child in $Children) {
        $ForcedCount += Stop-ProcessTreeGracefully -Id $Child.Id -GraceSeconds $GraceSeconds
    }
    $Process = Get-Process -Id $Id -ErrorAction SilentlyContinue
    if ($null -eq $Process) { return $ForcedCount }

    if ($IsWindows) {
        [void]$Process.CloseMainWindow()
    } else {
        $Kill = Get-Command kill -CommandType Application -ErrorAction SilentlyContinue
        if ($null -eq $Kill) { throw "Cannot send TERM to process $Id because kill is unavailable." }
        & $Kill.Source -TERM $Id *> $null
    }

    $Deadline = [DateTime]::UtcNow.AddSeconds($GraceSeconds)
    while ((Test-ProcessAlive -Id $Id) -and [DateTime]::UtcNow -lt $Deadline) {
        Start-Sleep -Milliseconds 100
    }
    if (Test-ProcessAlive -Id $Id) {
        Stop-Process -Id $Id -Force -ErrorAction SilentlyContinue
        $ForcedCount++
        $ForceDeadline = [DateTime]::UtcNow.AddSeconds(2)
        while ((Test-ProcessAlive -Id $Id) -and [DateTime]::UtcNow -lt $ForceDeadline) {
            Start-Sleep -Milliseconds 50
        }
    }
    return $ForcedCount
}

function Stop-ProcessTree([int]$Id) {
    [void](Stop-ProcessTreeGracefully -Id $Id -GraceSeconds 5)
}

function Test-HttpReady([string]$Uri, [string]$ExpectedStatus = '') {
    try {
        $Response = Invoke-WebRequest -Uri $Uri -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($Response.StatusCode -ne 200) { return $false }
        if ($ExpectedStatus) {
            $Content = if ($Response.Content -is [byte[]]) {
                [System.Text.Encoding]::UTF8.GetString($Response.Content)
            } else {
                [string]$Response.Content
            }
            $Body = $Content | ConvertFrom-Json -ErrorAction Stop
            return $Body.status -eq $ExpectedStatus
        }
        return $true
    } catch {
        return $false
    }
}

function Test-AgentReady([int]$Port, [string]$Token) {
    try {
        $Headers = @{ 'X-Monitor-Token' = $Token }
        $Response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/monitor/v1/info" `
            -Headers $Headers -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        return $Response.StatusCode -eq 200
    } catch {
        return $false
    }
}
