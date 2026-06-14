import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { UsersService } from "../users/users.service";
import { AuthService } from "./auth.service";

// Idempotently creates the bootstrap admin from WILLY_ADMIN_EMAIL/PASSWORD on first boot.
@Injectable()
export class AdminSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeedService.name);

  constructor(
    private readonly users: UsersService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config.get<string>("WILLY_ADMIN_EMAIL");
    const password = this.config.get<string>("WILLY_ADMIN_PASSWORD");

    if (!email || !password) {
      return;
    }

    if (await this.users.findByEmail(email)) {
      return;
    }

    await this.users.create({
      email,
      passwordHash: await this.auth.hashPassword(password),
      role: "ADMIN",
    });

    this.logger.log(`seeded admin user ${email}`);
  }
}
