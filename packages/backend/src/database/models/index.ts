import { sequelize } from '../../config/database';
import { User } from './User';
import { Campaign } from './Campaign';
import { Recipient } from './Recipient';
import { CampaignRecipient } from './CampaignRecipient';
import { RefreshToken } from './RefreshToken';

// Initialize all models
User.initModel(sequelize);
Campaign.initModel(sequelize);
Recipient.initModel(sequelize);
CampaignRecipient.initModel(sequelize);
RefreshToken.initModel(sequelize);

// --- Associations ---

// User → Campaign (one-to-many)
User.hasMany(Campaign, { foreignKey: 'createdBy', as: 'campaigns' });
Campaign.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

// Campaign ↔ Recipient (many-to-many through CampaignRecipient)
Campaign.belongsToMany(Recipient, {
  through: CampaignRecipient,
  foreignKey: 'campaignId',
  as: 'recipients',
});
Recipient.belongsToMany(Campaign, {
  through: CampaignRecipient,
  foreignKey: 'recipientId',
  as: 'campaigns',
});

// Direct associations for eager loading join table
Campaign.hasMany(CampaignRecipient, { foreignKey: 'campaignId', as: 'campaignRecipients' });
CampaignRecipient.belongsTo(Campaign, { foreignKey: 'campaignId' });

Recipient.hasMany(CampaignRecipient, { foreignKey: 'recipientId' });
CampaignRecipient.belongsTo(Recipient, { foreignKey: 'recipientId', as: 'recipient' });

// User → RefreshToken (one-to-many)
User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
RefreshToken.belongsTo(User, { foreignKey: 'userId' });

export { sequelize, User, Campaign, Recipient, CampaignRecipient, RefreshToken };
