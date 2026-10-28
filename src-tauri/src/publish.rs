//! Uploading a web page to the user's own web host, over SFTP or FTP with TLS.
//! The password lives in the Mac's keychain; the page never sees it again once saved.

use std::fs;
use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};

const TIMEOUT: Duration = Duration::from_secs(20);
#[cfg(target_os = "macos")]
const KEYCHAIN_SERVICE: &str = "Imagime webbhotell";

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Protocol {
    Sftp,
    /// FTP with the connection encrypted (explicit TLS); plain FTP sends the password in the open.
    Ftps,
    Ftp,
}

/// Where pages go: the server, the account, the folder the web address points at, and that address.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct Host {
    pub protocol: Protocol,
    pub host: String,
    pub port: u16,
    pub user: String,
    /// Folder on the server that `url` shows, such as "domains/bilder.example.se/public_html".
    pub folder: String,
    pub url: String,
    /// The SFTP server's key as first seen, so a server pretending to be it is noticed.
    #[serde(default)]
    pub fingerprint: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Published {
    pub url: String,
    pub fingerprint: Option<String>,
}

#[cfg(target_os = "macos")]
fn keychain_account(host: &Host) -> String {
    format!("{}@{}", host.user, host.host)
}

#[cfg(target_os = "macos")]
fn keychain_entry(host: &Host) -> Result<keyring::Entry, String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, &keychain_account(host)).map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
pub fn save_password(host: &Host, password: &str) -> Result<(), String> {
    keychain_entry(host)?.set_password(password).map_err(|e| e.to_string())
}

#[cfg(target_os = "macos")]
pub fn has_password(host: &Host) -> bool {
    keychain_entry(host).and_then(|e| e.get_password().map_err(|e| e.to_string())).is_ok()
}

#[cfg(target_os = "macos")]
fn password(host: &Host) -> Result<String, String> {
    keychain_entry(host)?
        .get_password()
        .map_err(|_| "Lösenordet finns inte i nyckelringen. Skriv in det under Webbhotell.".to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn save_password(_host: &Host, _password: &str) -> Result<(), String> {
    Err("Lösenord kan bara sparas på Mac.".into())
}

#[cfg(not(target_os = "macos"))]
pub fn has_password(_host: &Host) -> bool {
    false
}

#[cfg(not(target_os = "macos"))]
fn password(_host: &Host) -> Result<String, String> {
    Err("Lösenord kan bara sparas på Mac.".into())
}

/// The page's address: the host's web address with the page's folder name after it.
pub fn page_url(base: &str, name: &str) -> String {
    format!("{}/{}/", base.trim().trim_end_matches('/'), name)
}

/// A folder on the server with the page's folder after it, written with forward slashes.
fn remote_dir(folder: &str, name: &str) -> String {
    let folder = folder.trim().trim_end_matches('/');
    if folder.is_empty() {
        name.to_string()
    } else {
        format!("{folder}/{name}")
    }
}

/// Every folder from the top down to `dir`, so each can be made if missing.
fn parents(dir: &str) -> Vec<String> {
    let absolute = dir.starts_with('/');
    let mut path = String::new();
    let mut all = Vec::new();
    for part in dir.split('/').filter(|p| !p.is_empty()) {
        if !path.is_empty() || absolute {
            path.push('/');
        }
        path.push_str(part);
        all.push(path.clone());
    }
    all
}

fn connect(host: &Host) -> Result<TcpStream, String> {
    let addr = (host.host.trim(), host.port)
        .to_socket_addrs()
        .map_err(|_| format!("Hittar inte servern {}.", host.host))?
        .next()
        .ok_or_else(|| format!("Hittar inte servern {}.", host.host))?;
    let stream = TcpStream::connect_timeout(&addr, TIMEOUT)
        .map_err(|e| format!("Kunde inte ansluta till {}:{}: {e}", host.host, host.port))?;
    stream.set_read_timeout(Some(TIMEOUT)).ok();
    stream.set_write_timeout(Some(TIMEOUT)).ok();
    Ok(stream)
}

/// Uploads every file in `local` (as listed in `files`, relative to it) to the folder `name` on the host.
pub fn upload(host: &Host, local: &Path, files: &[String], name: &str) -> Result<Published, String> {
    upload_with(host, &password(host)?, local, files, name)
}

fn upload_with(host: &Host, password: &str, local: &Path, files: &[String], name: &str) -> Result<Published, String> {
    let dir = remote_dir(&host.folder, name);
    let fingerprint = match host.protocol {
        Protocol::Sftp => Some(upload_sftp(host, password, local, files, &dir)?),
        Protocol::Ftps | Protocol::Ftp => {
            upload_ftp(host, password, local, files, &dir)?;
            None
        }
    };
    Ok(Published { url: page_url(&host.url, name), fingerprint })
}

fn upload_sftp(host: &Host, password: &str, local: &Path, files: &[String], dir: &str) -> Result<String, String> {
    let mut session = ssh2::Session::new().map_err(|e| e.to_string())?;
    session.set_timeout(TIMEOUT.as_millis() as u32);
    session.set_tcp_stream(connect(host)?);
    session.handshake().map_err(|e| format!("Kunde inte starta SFTP: {e}"))?;
    let key = session
        .host_key_hash(ssh2::HashType::Sha256)
        .ok_or("Servern visade ingen nyckel.")?;
    let fingerprint: String = key.iter().map(|b| format!("{b:02x}")).collect();
    if let Some(known) = &host.fingerprint {
        if known != &fingerprint {
            return Err("Servern svarar med en annan nyckel än förra gången. Det kan betyda att någon \
                        utger sig för att vara den. Kontrollera med webbhotellet innan du laddar upp."
                .into());
        }
    }
    session
        .userauth_password(host.user.trim(), password)
        .map_err(|_| "Fel användarnamn eller lösenord.".to_string())?;
    let sftp = session.sftp().map_err(|e| e.to_string())?;
    let mut made = std::collections::HashSet::new();
    for file in files {
        let target = format!("{dir}/{file}");
        let parent = target.rsplit_once('/').map(|(p, _)| p).unwrap_or("");
        for folder in parents(parent) {
            if made.insert(folder.clone()) && sftp.stat(Path::new(&folder)).is_err() {
                sftp.mkdir(Path::new(&folder), 0o755)
                    .map_err(|e| format!("Kunde inte skapa mappen {folder}: {e}"))?;
            }
        }
        let bytes = fs::read(local.join(file)).map_err(|e| e.to_string())?;
        let mut remote = sftp
            .create(Path::new(&target))
            .map_err(|e| format!("Kunde inte skriva {target}: {e}"))?;
        remote.write_all(&bytes).map_err(|e| format!("Kunde inte skriva {target}: {e}"))?;
    }
    Ok(fingerprint)
}

fn upload_ftp(host: &Host, password: &str, local: &Path, files: &[String], dir: &str) -> Result<(), String> {
    use suppaftp::types::FileType;
    use suppaftp::{FtpError, RustlsConnector, RustlsFtpStream};

    let ftp = RustlsFtpStream::connect_with_stream(connect(host)?).map_err(|e| format!("Kunde inte ansluta: {e}"))?;
    let mut ftp = if host.protocol == Protocol::Ftps {
        let roots = suppaftp::rustls::RootCertStore { roots: webpki_roots::TLS_SERVER_ROOTS.to_vec() };
        let provider = Arc::new(suppaftp::rustls::crypto::ring::default_provider());
        let config = suppaftp::rustls::ClientConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions()
            .map_err(|e| e.to_string())?
            .with_root_certificates(roots)
            .with_no_client_auth();
        ftp.into_secure(RustlsConnector::from(Arc::new(config)), host.host.trim()).map_err(|e| match e {
            FtpError::UnexpectedResponse(_) => {
                "Servern har inte krypterad FTP (FTPS). Välj SFTP i stället, om webbhotellet har det.".to_string()
            }
            e => format!(
                "Kunde inte kryptera anslutningen ({e}). Prova serveradressen som webbhotellet anger för FTP, \
                 den kan skilja sig från din domän."
            )
        })?
    } else {
        ftp
    };
    ftp.login(host.user.trim(), password).map_err(|e| match e {
        FtpError::UnexpectedResponse(_) => "Fel användarnamn eller lösenord.".to_string(),
        e => e.to_string(),
    })?;
    ftp.transfer_type(FileType::Binary).map_err(|e| e.to_string())?;
    let mut made = std::collections::HashSet::new();
    for file in files {
        let target = format!("{dir}/{file}");
        let parent = target.rsplit_once('/').map(|(p, _)| p).unwrap_or("");
        for folder in parents(parent) {
            // A folder that is already there answers with an error, which is fine.
            if made.insert(folder.clone()) {
                let _ = ftp.mkdir(&folder);
            }
        }
        let mut reader = fs::File::open(local.join(file)).map_err(|e| e.to_string())?;
        let mut bytes = Vec::new();
        reader.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        ftp.put_file(&target, &mut bytes.as_slice())
            .map_err(|e| format!("Kunde inte skriva {target}: {e}"))?;
    }
    let _ = ftp.quit();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_the_page_address_and_folders() {
        assert_eq!(page_url("https://bilder.example.se/", "sommar"), "https://bilder.example.se/sommar/");
        assert_eq!(remote_dir("public_html/", "sommar"), "public_html/sommar");
        assert_eq!(remote_dir("", "sommar"), "sommar");
        assert_eq!(parents("public_html/sommar/bilder"), ["public_html", "public_html/sommar", "public_html/sommar/bilder"]);
        assert_eq!(parents("/home/u/www"), ["/home", "/home/u", "/home/u/www"]);
    }

    /// Uploads to a real server named in IMAGIME_TEST_HOST as "protocol,host,port,user,password,folder".
    #[test]
    #[ignore]
    fn uploads_to_a_test_server() {
        let spec = std::env::var("IMAGIME_TEST_HOST").expect("IMAGIME_TEST_HOST");
        let parts: Vec<&str> = spec.split(',').collect();
        let protocol = match parts[0] {
            "sftp" => Protocol::Sftp,
            "ftps" => Protocol::Ftps,
            _ => Protocol::Ftp,
        };
        let mut host = Host {
            protocol,
            host: parts[1].into(),
            port: parts[2].parse().unwrap(),
            user: parts[3].into(),
            folder: parts[5].into(),
            url: "https://bilder.example.se".into(),
            fingerprint: None,
        };
        let local = std::env::temp_dir().join(format!("ib-publish-{}", std::process::id()));
        fs::create_dir_all(local.join("bilder")).unwrap();
        fs::write(local.join("index.html"), "<h1>Hej</h1>").unwrap();
        fs::write(local.join("bilder/001-a.jpg"), [1u8, 2, 3]).unwrap();
        let files = vec!["index.html".to_string(), "bilder/001-a.jpg".to_string()];
        let done = upload_with(&host, parts[4], &local, &files, "sommar").unwrap();
        assert_eq!(done.url, "https://bilder.example.se/sommar/");
        // Again, now over the folders already there; and a changed key is refused.
        host.fingerprint = done.fingerprint.clone();
        upload_with(&host, parts[4], &local, &files, "sommar").unwrap();
        if host.protocol == Protocol::Sftp {
            host.fingerprint = Some("00".into());
            assert!(upload_with(&host, parts[4], &local, &files, "sommar").unwrap_err().contains("annan nyckel"));
        }
        assert!(upload_with(&host, "fel", &local, &files, "sommar").is_err());
        fs::remove_dir_all(&local).unwrap();
    }
}
