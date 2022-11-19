export const data = new Discord.SlashCommandBuilder()
   .setName(`votekick`)
   .setDescription(`📣 call a votekick on someone`)
   .addUserOption(
      new Discord.SlashCommandUserOption()
         .setName(`user`)
         .setDescription(`👥 user to votekick`)
         .setRequired(true)
   )
   .addStringOption(
      new Discord.SlashCommandStringOption()
         .setName(`reason`)
         .setDescription(`📝 reason for the votekick`)
         .setMaxLength(128)
         .setRequired(true)
   );

export const guildOnly = true;


import Discord from "discord.js";
import dayjs from "dayjs";
import { FieldValue, Timestamp } from "@google-cloud/firestore";

import { emojis, autoArray, choice, strip } from "@magicalbunny31/awesome-utility-stuff";

/**
 * @param {Discord.ChatInputCommandInteraction} interaction
 * @param {import("@google-cloud/firestore").Firestore} firestore
 */
export default async (interaction, firestore) => {
   // options
   const user   = interaction.options.getUser(`user`);
   const reason = interaction.options.getString(`reason`);


   // this user isn't a part of this guild
   const member = interaction.options.getMember(`user`);

   if (!member)
      return await interaction.reply({
         content: `i'm not sure if you've realised this but ${user} isn't in this server`,
         ephemeral: true
      });


   // trying to votekick someone who can't be timed out
   if (!member.moderatable) {
      // timeout the user for one minute
      if (interaction.member.moderatable)
         await interaction.member.timeout(60 * 1000);

      // reply to the interaction
      return await interaction.reply({
         content: `📣 **${interaction.user} is a nerd**`
      });
   };


   // votekick is on cooldown
   const database = firestore.collection(`command`).doc(`votekick`);
   const { "cooldown-expires-at": cooldownExpiresAt, "votekick-in-progress-at": votekickInProgressAt } = (await database.get()).data() || {};

   if (dayjs().unix() < cooldownExpiresAt.seconds)
      return await interaction.reply({
         content: strip`
            ${emojis.flooded_area} ${Discord.chatInputApplicationCommandMention(`votekick`, interaction.client.application.id)} is on cooldown!
            try again ${Discord.time(cooldownExpiresAt.seconds, Discord.TimestampStyles.RelativeTime)}~
         `,
         ephemeral: true
      });


   // a votekick is in progress
   const votekickProbablyStillInProgress = dayjs().unix() - votekickInProgressAt?.seconds < 120; // two minutes haven't passed yet: the votekick probably is still ongoing

   if (votekickInProgressAt && votekickProbablyStillInProgress)
      return await interaction.reply({
         content: `a ${emojis.flooded_area} ${Discord.chatInputApplicationCommandMention(`votekick`, interaction.client.application.id)} is still in progress in the server!`,
         ephemeral: true
      });


   // number of people required to votekick this user
   const requiredVotes = choice([
      2, 2, 2,
      3, 3,
      4
   ]);

   const voters = autoArray(requiredVotes, () => `> 👥 ${emojis.loading}`);


   // set the votekick in progress
   await database.update({
      "votekick-in-progress-at": new Timestamp(dayjs().unix(), 0)
   });


   // get the /votekick pings roles
   const { "votekick-pings": votekickPings } = (await firestore.collection(`role`).doc(`mention-roles`).get()).data();


   // components
   const components = [
      new Discord.ActionRowBuilder()
         .setComponents(
            new Discord.ButtonBuilder()
               .setCustomId(`${interaction.id}:/vote`)
               .setLabel(`/vote`)
               .setStyle(Discord.ButtonStyle.Primary)
         )
   ];


   // reply to the interaction
   const voteEndsAt = dayjs().add(2, `minutes`).unix();

   await interaction.reply({
      content: strip`
         📢 **${Discord.roleMention(votekickPings)}**
         📣 **a votekick on ${user} has been started by ${interaction.user} for the reason of \`${reason}\`**
         📰 **${requiredVotes} votes are needed ${Discord.time(voteEndsAt, Discord.TimestampStyles.RelativeTime)}**
         ${voters.join(`\n`)}
      `,
      components,
      allowedMentions: {
         users: [ user.id ],
         roles: [ votekickPings ]
      }
   });


   // create an InteractionCollector
   const vote = interaction.channel.createMessageComponentCollector({
      filter: i => i.customId.startsWith(interaction.id),
      time: 60000
   });


   // count a vote
   vote.on(`collect`, async buttonInteraction => {
      // this person is calling the votekick
      if (buttonInteraction.user.id === interaction.user.id)
         return await buttonInteraction.deferUpdate();


      // can't votekick self
      if (buttonInteraction.user.id === user.id)
         return await buttonInteraction.deferUpdate();


      // this user has already voted
      if (voters.some(voter => voter.includes(buttonInteraction.user.id)))
         return await buttonInteraction.deferUpdate();


      // add this user to the voters list
      const indexOfSpace = voters.findIndex(voter => voter.includes(emojis.loading));
      voters.splice(indexOfSpace, 1, `> 👥 ${buttonInteraction.user}`);


      // update the interaction
      await buttonInteraction.update({
         content: strip`
            📢 **${Discord.roleMention(votekickPings)}**
            📣 **a votekick on ${user} has been started by ${interaction.user} for the reason of \`${reason}\`**
            📰 **${requiredVotes} votes are needed ${Discord.time(voteEndsAt, Discord.TimestampStyles.RelativeTime)}**
            ${voters.join(`\n`)}
         `,
         allowedMentions: {
            users: [ user.id ],
            roles: [ votekickPings ]
         }
      });


      // the required amount of votes have been reached
      if (voters.every(voter => !voter.includes(emojis.loading)))
         vote.stop(`required votes reached`);
   });


   vote.on(`end`, async (collected, reason) => {
      // set the cooldown and votekick progress
      await database.update({
         "cooldown-expires-at": new Timestamp(dayjs().add(`30`, `seconds`).unix(), 0),
         "votekick-in-progress-at": FieldValue.delete()
      });


      // didn't reach the required votes in the time
      if (reason === `time`) {
         // replace all unfilled voter spaces with an x
         for (let i = 0; i < voters.length; i ++) {
            if (!voters[i].includes(emojis.loading))
               continue;

            voters[i] = `> 👥 ❌`;
         };

         // disable the components
         for (const actionRow of components)
            for (const component of actionRow.components)
               component.data.disabled = true;

         // edit the original interaction's reply
         return await interaction.editReply({
            content: strip`
               📣 **votekick on ${user} has failed**
               ⌚ **30 second cooldown on more ${emojis.flooded_area} ${Discord.chatInputApplicationCommandMention(`votekick`, interaction.client.application.id)}s**
               ${voters.join(`\n`)}
            `,
            components: [],
            allowedMentions: {
               users: [ user.id ]
            }
         });
      };


      // InteractionCollector ended for some other reason
      if (reason !== `required votes reached`)
         return;


      // add this to the database
      await firestore.collection(`leaderboard-statistics`).doc(`votekick`).update({
         [user.id]: FieldValue.increment(1)
      });


      // time out the user depending on how many required votes there were
      const timedOutFor = requiredVotes * 60 * 1000 * 2;

      await member.timeout(timedOutFor, `/votekick by ${interaction.user.tag}`);


      // edit the interaction's original reply
      return await interaction.editReply({
         content: strip`
            📣 **${user} has been ~~timed out~~ kicked with ${requiredVotes} votes**
            ⌚ **30 second cooldown on more ${emojis.flooded_area} ${Discord.chatInputApplicationCommandMention(`votekick`, interaction.client.application.id)}s**
            ${voters.join(`\n`)}
         `,
         components: [],
         allowedMentions: {
            users: [ user.id ]
         }
      });
   });
};