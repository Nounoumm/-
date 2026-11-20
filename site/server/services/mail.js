import nodemailer from 'nodemailer'

function unavailable() {
  return Object.assign(new Error('邮件服务暂不可用，请联系管理员配置 SMTP_HOST、SMTP_PORT 和 SMTP_FROM。'), { status: 503, code: 'MAIL_UNAVAILABLE' })
}

export function createMailSender(env = process.env) {
  let transport
  function assertReady() {
    const port = Number(env.SMTP_PORT)
    if (!env.SMTP_HOST || !env.SMTP_FROM || !Number.isInteger(port) || port < 1 || port > 65535) throw unavailable()
    if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD)) throw unavailable()
  }
  async function sendMail({ to, subject, text }) {
    assertReady()
    transport ||= nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT),
      secure: env.SMTP_SECURE === 'true' || Number(env.SMTP_PORT) === 465,
      requireTLS: env.SMTP_REQUIRE_TLS !== 'false',
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
      connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      logger: false, debug: false,
    })
    try {
      const result = await transport.sendMail({ from: env.SMTP_FROM, to, subject, text })
      if (!result.accepted?.length) throw unavailable()
    } catch { throw unavailable() }
  }
  sendMail.assertReady = assertReady
  return sendMail
}
