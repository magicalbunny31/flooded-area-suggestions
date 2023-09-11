export const name = "submit-appeal";
export const guilds = [ process.env.GUILD_FLOODED_AREA ];

import Discord from "discord.js";
import { FieldValue } from "@google-cloud/firestore";
import { colours, emojis, strip, wait } from "@magicalbunny31/awesome-utility-stuff";

/**
 * @param {Discord.ButtonInteraction} interaction
 * @param {import("@google-cloud/firestore").Firestore} firestore
 */
export default async (interaction, firestore) => {
   // button info
   const [ _button ] = interaction.customId.split(`:`);


   // the report embed (it changes before responding to the interaction)
   const appealEmbed = new Discord.EmbedBuilder(interaction.message.embeds[0].data)
      .setFields({
         name: `THEIR ROBLOX ACCOUNT`,
         value: interaction.message.embeds[0].fields[0].value
      }, {
         name: `WHY THEY WERE BANNED`,
         value: interaction.message.embeds[0].fields[1].value
      }, {
         name: `WHY THEY BELIEVE WE SHOULD RECONSIDER IT`,
         value: interaction.message.embeds[0].fields[2].value
      })
      .setFooter({
         text: null
      });


   // update the interaction
   await interaction.update({
      embeds: [
         new Discord.EmbedBuilder()
            .setColor(colours.flooded_area)
            .setTitle(`🔨 Ban Appeals`)
            .setDescription(`${emojis.loading} This'll take a few seconds: your appeal is being submitted...`)
      ],
      components: []
   });


   // create the ticket thread
   const ticketsDocRef  = firestore.collection(`tickets`).doc(interaction.guild.id);
   const ticketsDocSnap = await ticketsDocRef.get();
   const ticketsDocData = ticketsDocSnap.data();

   await ticketsDocRef.update({
      "ticket-count": FieldValue.increment(1)
   });
   const currentTicketCount = ticketsDocData[`ticket-count`] + 1;

   const thread = await interaction.channel.threads.create({
      name: `🔨┃ticket #${currentTicketCount}`,
      type: Discord.ChannelType.PrivateThread,
      invitable: false
   });

   await thread.members.add(interaction.user);

   const appealMessage = await thread.send({
      embeds: [
         appealEmbed
      ],
      components: [
         new Discord.ActionRowBuilder()
            .setComponents(
               new Discord.ButtonBuilder()
                  .setCustomId(`close-ticket:${interaction.user.id}:${currentTicketCount}`)
                  .setLabel(`Close ticket`)
                  .setEmoji(`💣`)
                  .setStyle(Discord.ButtonStyle.Danger)
            )
      ]
   });


   // get the moderators to mention
   const members = await (async () => {
      const fetchedMembers = [];
      let lastMember;

      while (true) {
         const members = (await interaction.guild.members.list({ limit: 1000, ...fetchedMembers.length ? { after: fetchedMembers.at(-1).id } : {} }))
            .filter(member => member.roles.cache.has(process.env.FA_ROLE_MODERATION_TEAM));

         fetchedMembers.push(...members.values());

         if (lastMember?.id === fetchedMembers.at(-1)?.id)
            break;

         else
            lastMember = fetchedMembers.at(-1);

         await wait(1000);
      };

      return fetchedMembers;
   })();

   const membersToMention = members
      .map(member => {
         const { members = [], "ban-appeals": banAppeals = true } = ticketsDocData.moderators[member.id] || {};
         return {
            member,
            mention: (!members.includes(interaction.user.id)) // this member is muted
               &&    (banAppeals)                             // this moderator doesn't want to be mentioned for ban appeals
         };
      })
      .filter(({ mention }) => mention)
      .map(({ member }) => member);

   const roleToMention = await interaction.guild.roles.create({
      name: `Moderation Team`
   });

   for (const member of membersToMention)
      await member.roles.add(roleToMention);

   const mentionMessage = await thread.send({
      content: strip`
         🔨 Ban Appeals
         ${roleToMention}
      `,
      files: [
         new Discord.AttachmentBuilder()
            .setFile(`./assets/report-a-player/oh-moderators.gif`)
      ]
   });

   await mentionMessage.delete();
   await roleToMention.delete();


   // edit the interaction's original reply
   await interaction.editReply({
      embeds: [
         new Discord.EmbedBuilder()
            .setColor(colours.flooded_area)
            .setTitle(`🔨 Ban Appeals`)
            .setDescription(`✅ Thanks for submitting! A member of the ${Discord.roleMention(process.env.FA_ROLE_MODERATION_TEAM)} will review your appeal soon.`)
      ],
      components: [
         new Discord.ActionRowBuilder()
            .setComponents(
               new Discord.ButtonBuilder()
                  .setLabel(`View appeal`)
                  .setEmoji(`➡️`)
                  .setStyle(Discord.ButtonStyle.Link)
                  .setURL(appealMessage.url)
            )
      ]
   });
};