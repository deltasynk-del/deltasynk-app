function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(15,23,42,.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#0A2540 0%,#0f7a8a 100%);padding:28px 24px;text-align:center;">
            <div style="color:#fff;font-size:22px;font-weight:800;letter-spacing:-.5px;">DeltaSynk</div>
            <div style="color:rgba(255,255,255,.85);font-size:13px;margin-top:6px;">Operations Portal</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 24px;">
            <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#0f172a;">${title}</p>
            ${body}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(label: string, href: string): string {
  return `<p style="margin:24px 0 16px;text-align:center;">
    <a href="${href}" style="background:#0f7a8a;color:#fff;padding:14px 28px;text-decoration:none;border-radius:8px;display:inline-block;font-weight:700;font-size:15px;">${label}</a>
  </p>
  <p style="margin:0;font-size:13px;color:#64748b;text-align:center;word-break:break-all;">
    Or open: <a href="${href}" style="color:#0f7a8a;">${href}</a>
  </p>`;
}

export function passwordResetEmail(fullName: string, resetUrl: string): string {
  const name = fullName.trim() || 'there';
  return layout(
    'Password reset request',
    `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">
      Hi <strong>${escapeHtml(name)}</strong>,<br>
      You requested a password reset for your DeltaSynk Portal account. Click the button below to set a new password.
      This link expires in one hour.
    </p>
    ${button('Reset password', resetUrl)}
    <p style="margin:20px 0 0;font-size:13px;color:#94a3b8;line-height:1.5;">
      If you did not request this, you can ignore this email. Your password will not change.
    </p>`,
  );
}

export function twoFactorCodeEmail(fullName: string, code: string): string {
  const name = fullName.trim() || 'there';
  return layout(
    'Your verification code',
    `<p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#475569;">
      Hi <strong>${escapeHtml(name)}</strong>,<br>
      Use this code to finish signing in to the DeltaSynk Portal. It expires in 10 minutes.
    </p>
    <p style="margin:0 0 20px;text-align:center;font-size:32px;font-weight:800;letter-spacing:8px;color:#0A2540;">${escapeHtml(code)}</p>
    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.5;">
      If you did not try to sign in, change your password now — someone else knows it.
    </p>`,
  );
}
