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
User.hasMany(Campaign, { foreignKey: 'created_by', as: 'campaigns' });
Campaign.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// Campaign ↔ Recipient (many-to-many through CampaignRecipient)
Campaign.belongsToMany(Recipient, {
  through: CampaignRecipient,
  foreignKey: 'campaign_id',
  as: 'recipients',
});
Recipient.belongsToMany(Campaign, {
  through: CampaignRecipient,
  foreignKey: 'recipient_id',
  as: 'campaigns',
});

// Direct associations for eager loading join table
Campaign.hasMany(CampaignRecipient, { foreignKey: 'campaign_id', as: 'campaignRecipients' });
CampaignRecipient.belongsTo(Campaign, { foreignKey: 'campaign_id' });

Recipient.hasMany(CampaignRecipient, { foreignKey: 'recipient_id' });
CampaignRecipient.belongsTo(Recipient, { foreignKey: 'recipient_id', as: 'recipient' });

// User → RefreshToken (one-to-many)
User.hasMany(RefreshToken, { foreignKey: 'user_id', as: 'refreshTokens' });
RefreshToken.belongsTo(User, { foreignKey: 'user_id' });

export { sequelize, User, Campaign, Recipient, CampaignRecipient, RefreshToken };
