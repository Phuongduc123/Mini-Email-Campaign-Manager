import { User, UserCreationAttributes } from '../../database/models/User';

/**
 * Data-access layer for the auth module.
 * All direct DB calls live here; no business logic.
 */
export class AuthRepository {
  async findUserByEmail(email: string): Promise<User | null> {
    return User.findOne({ where: { email } });
  }

  async findUserById(id: number): Promise<User | null> {
    return User.findByPk(id);
  }

  async createUser(data: UserCreationAttributes): Promise<User> {
    return User.create(data);
  }
}
