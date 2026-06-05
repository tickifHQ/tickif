export type SmsSender = {
  send(phoneNumber: string, code: string): Promise<void>;
};

export class ConsoleSmsSender implements SmsSender {
  async send(phoneNumber: string, code: string): Promise<void> {
    console.log(`[sms] OTP for ${phoneNumber}: ${code}`);
  }
}

export class MissingSmsSender implements SmsSender {
  async send(): Promise<void> {
    throw new Error('SMS provider credentials are required in production');
  }
}

export class Msg91SmsSender implements SmsSender {
  constructor(
    private readonly authKey: string,
    private readonly senderId: string,
  ) {}

  async send(phoneNumber: string, code: string): Promise<void> {
    const body = new URLSearchParams({
      authkey: this.authKey,
      mobiles: phoneNumber.replace(/\D/g, ''),
      message: `Your Tickif verification code is ${code}`,
      sender: this.senderId,
      route: '4',
      country: '91',
    });

    const response = await fetch('https://control.msg91.com/api/sendhttp.php', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`MSG91 SMS request failed with status ${response.status}`);
    }
  }
}

export type CreateSmsSenderOptions = {
  authKey?: string;
  senderId?: string;
  isProduction: boolean;
};

export function createSmsSender(options: CreateSmsSenderOptions): SmsSender {
  if (options.authKey && options.senderId) {
    return new Msg91SmsSender(options.authKey, options.senderId);
  }

  if (options.isProduction) {
    return new MissingSmsSender();
  }

  return new ConsoleSmsSender();
}
