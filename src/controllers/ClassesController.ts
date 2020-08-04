import { Request, Response } from 'express';

import db from '../database/connection';
import ConvertHoursToMinutes from '../utils/convertHourToMinutes';

interface ScheduleItem {
	weekday: number,
	from: string,
	to: string
}

export default class ClassesController 
{
	async index(req: Request, res: Response) 
	{
		const filters = req.query;
		const subject = filters.subject as string;
		const weekday = filters.weekday as string;
		const time = filters.time as string;

		if(!filters.subject || !filters.weekday || !filters.time) {
			return res.status(400).json({
				error: 'Missing filters to search classes'
			});
		}

		const timeInMinutes = ConvertHoursToMinutes(filters.time as string);

		const classes = await db('classes')
			.whereExists(function() {
				this.select('class_schedules.*')
					.from('class_schedules')
					.whereRaw('`class_schedules`.`class_id` = `classes`.`id`')
					.whereRaw('`class_schedules`.`weekday` = ??', [Number(weekday)])
					.whereRaw('`class_schedules`.`from` <= ??', [timeInMinutes])
					.whereRaw('`class_schedules`.`to` > ??', [timeInMinutes])
			})
			.where('classes.subject','=', subject)
			.join('users','classes.user_id','=','users.id')
			.select(['classes.*','users.*']);
			
		return res.json(classes);
	}

	async create(req:Request, res: Response) 
	{
		const { name, avatar, whatsapp, bio, subject, cost, schedule } = req.body;
	
		const trx = await db.transaction();
	
		try {
			const insertedUsersIds = await trx('users').insert({
				name, avatar, whatsapp, bio
			});
		
			const user_id = insertedUsersIds[0];
		
			const insertedClassesIds = await trx('classes').insert({
				subject, cost, user_id
			});
		
			const class_id = insertedClassesIds[0];
		
			const classSchedule = schedule.map((scheduleItem: ScheduleItem) => {
				return {
					weekday: scheduleItem.weekday,
					from: ConvertHoursToMinutes(scheduleItem.from),
					to: ConvertHoursToMinutes(scheduleItem.to),
					class_id,
				}
			});
		
			await trx('class_schedules').insert(classSchedule);
		
			await trx.commit();
			return res.status(201).send();
		} catch(err) {
			await trx.rollback();
	
			return res.status(400).json({
				error: 'Unexpected error while creating new class'
			})
		}
	}
}