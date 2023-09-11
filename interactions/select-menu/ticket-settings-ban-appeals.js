export const name = "ticket-settings-ban-appeals";
export const guilds = [ process.env.GUILD_FLOODED_AREA ];

import Discord from "discord.js";

/**
 * @param {Discord.StringSelectMenuInteraction} interaction
 * @param {import("@google-cloud/firestore").Firestore} firestore
 */
export default async (interaction, firestore) => {
   // select menu info
   const [ _selectMenu ] = interaction.customId.split(`:`);
   const [ enabled ] = interaction.values;


   // defer the interaction's update
   await interaction.deferUpdate();


   // set these strings in the database
   await firestore.collection(`tickets`).doc(interaction.guild.id).update({
      [`moderators.${interaction.user.id}.ban-appeals`]: enabled === `true`
   });
};