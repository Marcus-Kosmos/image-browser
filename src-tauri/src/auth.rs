//! Asks the owner of the Mac to confirm it is them, with Touch ID or the login password.

/// Whether the person confirmed. A cancelled prompt is `Ok(false)`; other failures are errors.
#[cfg(target_os = "macos")]
pub fn confirm_owner(reason: &str) -> Result<bool, String> {
    use std::sync::mpsc;

    use block2::RcBlock;
    use objc2::runtime::Bool;
    use objc2_foundation::{NSError, NSString};
    use objc2_local_authentication::{LAContext, LAError, LAPolicy};

    // Touch ID when there is a sensor, otherwise the password; macOS picks.
    let policy = LAPolicy::DeviceOwnerAuthentication;
    let context = unsafe { LAContext::new() };
    unsafe { context.canEvaluatePolicy_error(policy) }.map_err(|e| e.localizedDescription().to_string())?;

    let (tx, rx) = mpsc::channel();
    let reply = RcBlock::new(move |ok: Bool, error: *mut NSError| {
        let result = if ok.as_bool() {
            Ok(true)
        } else {
            // SAFETY: on failure the error is a valid NSError for the duration of the reply.
            match unsafe { error.as_ref() } {
                Some(e) if [LAError::UserCancel.0, LAError::SystemCancel.0, LAError::AppCancel.0].contains(&e.code()) => Ok(false),
                Some(e) => Err(e.localizedDescription().to_string()),
                None => Ok(false),
            }
        };
        let _ = tx.send(result);
    });
    unsafe { context.evaluatePolicy_localizedReason_reply(policy, &NSString::from_str(reason), &reply) };
    rx.recv().map_err(|e| e.to_string())?
}

/// Other systems have no owner check yet, so locking is not offered there.
#[cfg(not(target_os = "macos"))]
pub fn confirm_owner(_reason: &str) -> Result<bool, String> {
    Err("Upplåsning med Touch ID finns bara på Mac.".into())
}
