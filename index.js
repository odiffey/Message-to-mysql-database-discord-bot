const { Client, GatewayIntentBits, REST, Routes, Events, PermissionFlagsBits } = require('discord.js');
const mysql = require('mysql');

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMessages
	],
	partials: ['MESSAGE', 'CHANNEL', 'REACTION']
});

const config = require('./config.json');

const registerCommands = async () => {
	const rest = new REST({ version: '10' }).setToken(config.token);

	try {
		console.log('Started refreshing application (/) commands.');
	
		await rest.put(
			Routes.applicationCommands(config.clientId),
			{
				body: [
					{
						name: 'ping',
						description: 'Replies with Pong!',
					},
					{
						name: 'dump',
						description: 'Dump latest messages',
						options: [
							{
								name: 'channel',
								description: 'Channel to read messages from',
								type: 7,
								required: true
							},
							{
								name: 'limit',
								description: 'Message limit',
								type: 4,
								required: false
							}
						],
						default_member_permissions: PermissionFlagsBits.ManageGuild.toString()
					}
				]
			}
		);
	
		console.log('Successfully reloaded application (/) commands.');
	} catch (error) {
		console.error(error);
	}
};

const prepareMessage = (message, channel) => {
	return new Promise(resolve => {
		let { content, author, mentions } = message;

		mentions.users.forEach(user => {
			const replace = format =>
				content.replace(new RegExp(`<@!?${user.id}>`, 'g'), format);
			switch (channel.userMentionsMode) {
			case 0: {
				content = replace(`@${user.id}`);
				break;
			}
			case 1 || 2: {
				content = replace(`@${user.username}`);
				break;
			}
			case 3: {
				content = replace(`@${user.username}#${user.discriminator}`);
				break;
			}
			case 4: {
				content = replace(`@${user.id}@`);
				break;
			}
			default: {
				content = replace(`@${user.username}@`);
				break;
			}
			}
		});

		mentions.channels.forEach(channel => {
			const replace = format =>
				content.replace(
					new RegExp(`<#!?${channel.id}>`, 'g'),
					format
				);
			switch (channel.channelMentionsMode) {
			case 0: {
				content = replace(`#${channel.id}`);
				break;
			}
			case 1: {
				content = replace(`#${channel.name}`);
				break;
			}
			case 2: {
				content = replace(`#${channel.id}#`);
				break;
			}
			default: {
				content = replace(`#${channel.name}#`);
			}
			}
		});

		mentions.roles.forEach(role => {
			const replace = format =>
				content.replace(
					new RegExp(`<@&!?${role.id}>`, 'g'),
					format
				);
			switch (channel.roleMentionsMode) {
			case 0: {
				content = replace(`&${role.id}`);
				break;
			}
			case 1: {
				content = replace(`&${role.name}`);
				break;
			}
			default: {
				content = replace(`&${role.name}#${role.color.toString(16)}`);
			}
			}
		});

		switch (channel.authorMode) {
		case 0: {
			author = author.id;
			break;
		}
		case 1: {
			author = author.username;
			break;
		}
		case 2: {
			author = author.tag;
			break;
		}
		default: {
			author = message.member.nickname || author.username;
		}
		}

		resolve({
			id: message.id,
			message: content,
			author,
			images: JSON.stringify(
				message.attachments.map(attachment => attachment.url)
			),
			created_at: new Date(message.createdTimestamp),
			edited_at: new Date(message.editedTimestamp)
		});
	});
};

const storeMessages = (messages, channel) => {
	return new Promise((resolve, reject) => {
		const connection = mysql.createConnection({
			host: channel.dbHost,
			port: channel.dbPort,
			user: channel.dbUser,
			password: channel.dbPassword,
			database: channel.db,
			charset: 'utf8mb4',
			collation: 'utf8mb4_unicode_ci'
		});
		connection.connect();

		connection.query(
			`SELECT id, edited_at FROM ${channel.dbTable} WHERE id IN (?)`,
			[messages.map(message => message.id)],
			(error, results) => {
				if (error) throw error;

				Promise.all(
					messages.map(message => {
						return new Promise((_resolve, _reject) => {
							if (message.author.bot && !channel.allowBots) return _resolve();
							
							const result = results.find(result => result.id === message.id);
							
							let query;
							if (!result) query = `INSERT INTO ${channel.dbTable} SET ?`;
							else if (
								message.editedTimestamp &&
								new Date(message.editedTimestamp) !== new Date(result.edited_at)
							)
								query = `UPDATE ${channel.dbTable} SET ? WHERE id=${message.id}`;
		
							if (query)
								prepareMessage(message, channel).then(preparedMessage => {
									connection.query(query, preparedMessage, error => {
										if (error) _reject(error);
										else _resolve();
									});
								});
							else _resolve();
						});
					})
				).then(() => {
					connection.end();
					resolve();
				}).catch(err => {
					reject(err);
				});
			}
		);
	});
};

const deleteMessage = (message, channel) => {
	return new Promise((resolve, reject) => {
		const connection = mysql.createConnection({
			host: channel.dbHost,
			port: channel.dbPort,
			user: channel.dbUser,
			password: channel.dbPassword,
			database: channel.db,
			charset: 'utf8mb4',
			collation: 'utf8mb4_unicode_ci'
		});
		connection.connect();
	
		connection.query(
			`DELETE FROM ${channel.dbTable} WHERE id=${message.id}`,
			error => {
				connection.end();
				if (error) reject(error);
				else resolve();
			}
		);
	});
};

client.on('ready', () => {
	if (config.playing !== '') {
		client.user.setPresence({ status: 'online', game: { name: config.playing } });
	}
	console.log((new Date()).toLocaleString(), `Logged in as ${client.user.tag}!`);
});

client.on('interactionCreate', async interaction => {
	if (!interaction.isChatInputCommand()) return;
  
	switch (interaction.commandName) {
	case 'ping': {
		await interaction.reply({ content: 'Pong!', ephemeral: true });
		break;
	}
	case 'dump': {
		if (!config.admins.includes(interaction.user.id)) {
			await interaction.reply({
				content: 'You do not have permission to dump messages',
				ephemeral: true
			});
			break;
		}
	
		await interaction.reply({
			content: 'Starting to dump messages',
			ephemeral: true
		});

		const channel = interaction.options.getChannel('channel');
		const messages = await channel.messages.fetch({
			limit: Math.min(interaction.options.getInteger('limit') ?? 100, 100)
		});
		const channelConfig = config.channels.find(
			({ id }) => id === channel.id
		);

		if (!channelConfig) {
			await interaction.followUp({
				content: 'Channel not configured',
				ephemeral: true
			});
			break;
		}

		if (channelConfig.allowDump === false) {
			await interaction.followUp({
				content: 'Dumping is disabled in this channel',
				ephemeral: true
			});
			break;
		}

		await storeMessages(messages, channelConfig)
			.catch(async error => {
				await interaction.followUp({
					content: 'Error dumping messages',
					ephemeral: true
				});
				throw error;
			});

		await interaction.followUp({
			content: 'Successfully dumped messages',
			ephemeral: true
		});
		break;
	}
	default: {
		await interaction.reply({ content: 'Unknown command', ephemeral: true });
	}
	}
});

client.on(Events.MessageCreate, async message => {
	if (message.partial) await message.fetch();
	const channel = config.channels.find(
		({ id }) => id === message.channelId
	);
	await storeMessages([message], channel);
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
	if (newMessage.partial) await newMessage.fetch();
	const channel = config.channels.find(
		({ id }) => id === newMessage.channelId
	);
	await storeMessages([newMessage], channel);
});

client.on(Events.MessageDelete, async message => {
	if (message.partial) await message.fetch();
	const channel = config.channels.find(
		({ id }) => id === message.channelId
	);
	await deleteMessage(message, channel);
});

registerCommands();

client.login(config.token);
