const {
	Client,
	GatewayIntentBits,
	REST,
	Routes,
	Events,
	PermissionFlagsBits,
	Partials,
	GuildScheduledEventStatus
} = require('discord.js');
const mysql = require('mysql');

const client = new Client({
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.MessageContent,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildScheduledEvents
	],
	partials: [
		Partials.GuildScheduledEvent,
		Partials.Message
	]
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
					},
					{
						name: 'refresh_events',
						description: 'Refresh scheduled events',
						default_member_permissions: PermissionFlagsBits.ManageEvents.toString()
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
			case 5: {
				content = replace(`@${user.username}@`);
				break;
			}
			default: {
				break;
			}
			}
		});

		mentions.channels.forEach(mention => {
			const replace = format =>
				content.replace(
					new RegExp(`<#!?${mention.id}>`, 'g'),
					format
				);
			switch (channel.channelMentionsMode) {
			case 0: {
				content = replace(`#${mention.id}`);
				break;
			}
			case 1: {
				content = replace(`#${mention.name}`);
				break;
			}
			case 2: {
				content = replace(`#${mention.id}#`);
				break;
			}
			case 3: {
				content = replace(`#${mention.name}#`);
				break;
			}
			default: {
				break;
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
			case 2: {
				content = replace(`&${role.name}#${role.color.toString(16)}`);
				break;
			}
			default: {
				break;
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
		case 3: {
			author = message.member.nickname || author.username;
			break;
		}
		default: {
			break;
		}
		}

		const mentionsExport = {
			users: mentions.users.map(
				({ id, tag }) => ({ id, username: tag })
			),
			channels: mentions.channels.map(
				({ id, name }) => ({ id, name })
			),
			roles: mentions.roles.map(
				({ id, name, color }) =>
					({ id, name, color: color.toString(16) })
			)
		};
		if (! mentionsExport.users.find(user => user.id === author.id))
			mentionsExport.users.push({
				id: author.id,
				username: author.tag
			});

		resolve({
			id: message.id,
			message: content,
			author,
			images: JSON.stringify(
				message.attachments.map(attachment => attachment.url)
			),
			created_at: new Date(message.createdTimestamp),
			edited_at: new Date(message.editedTimestamp),
			mentions: JSON.stringify(mentionsExport)
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
				if (error) reject(error);
				else resolve();
			}
		);

		connection.end();
	});
};

const storeEvents = (events, eventConfig, cleanup=false) => {
	return new Promise((resolve, reject) => {
		const connection = mysql.createConnection({
			host: eventConfig.dbHost,
			port: eventConfig.dbPort,
			user: eventConfig.dbUser,
			password: eventConfig.dbPassword,
			database: eventConfig.db,
			charset: 'utf8mb4',
			collation: 'utf8mb4_unicode_ci'
		});
		connection.connect();

		let query = `SELECT id FROM ${eventConfig.dbTable}`;
		const params = [];
		if (!cleanup) {
			query += ' WHERE id IN (?)';
			params.push(events.map(event => event.id));
		}

		connection.query(
			query,
			params,
			(error, results) => {
				if (error) throw error;

				let expired = results.map(result => result.id);

				Promise.all(
					events.map(event => {
						return new Promise((_resolve, _reject) => {
							const result = results.find(result => result.id === event.id);
							const active = event.status === GuildScheduledEventStatus.Active || event.status === GuildScheduledEventStatus.Scheduled;
							
							let query;
							if (!result && active)
								query = `INSERT INTO ${eventConfig.dbTable} SET ?`;
							else if (result && active) {
								expired = expired.filter(id => id !== event.id);
								query = `UPDATE ${eventConfig.dbTable} SET ? WHERE id=${event.id}`;
							}

							if (query)
								client.users.fetch(event.creatorId).then(creator => {
									switch (eventConfig.creatorMode) {
									case 0: {
										creator = creator.id;
										break;
									}
									case 1: {
										creator = creator.username;
										break;
									}
									default: {
										creator = creator.tag;
										break;
									}
									}

									connection.query(
										query,
										[{
											id: event.id,
											name: event.name,
											description: event.description,
											creator,
											location: event.entityMetadata ? event.entityMetadata.location : undefined,
											image: event.image,
											starts_at: new Date(event.scheduledStartTimestamp),
											ends_at: event.scheduledEndTimestamp ? new Date(event.scheduledEndTimestamp) : undefined
										}],
										error => {
											if (error) _reject(error);
											else _resolve();
										}
									);
								});
							else _resolve();
						});
					})
				).then(async () => {
					await Promise.all(expired.map(id => deleteEvent({ id }, eventConfig)));
					connection.end();
					resolve();
				}).catch(err => {
					reject(err);
				});
			}
		);
	});
};

const deleteEvent = (event, eventConfig) => {
	return new Promise((resolve, reject) => {
		const connection = mysql.createConnection({
			host: eventConfig.dbHost,
			port: eventConfig.dbPort,
			user: eventConfig.dbUser,
			password: eventConfig.dbPassword,
			database: eventConfig.db,
			charset: 'utf8mb4',
			collation: 'utf8mb4_unicode_ci'
		});
		connection.connect();
	
		connection.query(
			`DELETE FROM ${eventConfig.dbTable} WHERE id=${event.id}`,
			error => {
				if (error) reject(error);
				else resolve();
			}
		);

		connection.end();
	});
};

const refreshEvents = async (guildId) => {
	let guilds = await client.guilds.fetch();

	if (guildId) guilds = guilds.filter(guild => guild.id === guildId);

	await Promise.all(
		guilds.map(guild => {
			return new Promise(resolve => {
				const eventConfig = config.events.find(
					event => event.guild === guild.id
				);
				if (eventConfig)
					guild.fetch().then(async _guild => {
						const events = await _guild.scheduledEvents.fetch();
						await storeEvents(events, eventConfig, true);
						resolve();
					});
				else resolve();
			});
		})
	);
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
	case 'refresh_events': {
		if (!config.admins.includes(interaction.user.id)) {
			await interaction.reply({
				content: 'You do not have permission to refresh events',
				ephemeral: true
			});
			break;
		}
	
		await interaction.reply({
			content: 'Starting to refresh events',
			ephemeral: true
		});

		const eventConfig = config.events.find(
			event => event.guild === interaction.guildId
		);
		if (!eventConfig) {
			await interaction.followUp({
				content: 'Guild not configured for events',
				ephemeral: true
			});
			break;
		}

		try {
			await refreshEvents(interaction.guildId);
		} catch (error) {
			await interaction.followUp({
				content: 'Error refreshing events',
				ephemeral: true
			});
			throw error;
		}

		await interaction.followUp({
			content: 'Successfully refreshed events',
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
	if (message.partial) message = await message.fetch();
	const channel = config.channels.find(
		({ id }) => id === message.channelId
	);
	if (channel) await storeMessages([message], channel);
});

client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
	if (newMessage.partial) newMessage = await newMessage.fetch();
	const channel = config.channels.find(
		({ id }) => id === newMessage.channelId
	);
	if (channel) await storeMessages([newMessage], channel);
});

client.on(Events.MessageDelete, async message => {
	const channel = config.channels.find(
		({ id }) => id === message.channelId
	);
	if (channel) await deleteMessage(message, channel);
});

client.on(Events.GuildScheduledEventCreate, async event => {
	if (event.partial) event = await event.fetch();
	const eventConfig = config.events.find(
		({ guild }) => guild === event.guildId
	);
	if (eventConfig) await storeEvents([event], eventConfig);
});

client.on(Events.GuildScheduledEventUpdate, async (oldEvent, newEvent) => {
	if (newEvent.partial) newEvent = await newEvent.fetch();
	const eventConfig = config.events.find(
		({ guild }) => guild === newEvent.guildId
	);
	if (eventConfig) await storeEvents([newEvent], eventConfig);
});

client.on(Events.GuildScheduledEventDelete, async event => {
	const eventConfig = config.events.find(
		({ guild }) => guild === event.guildId
	);
	if (eventConfig) await deleteEvent(event, eventConfig);
});

registerCommands();

client.login(config.token).then(async () => {
	await refreshEvents();
});
