'use strict';

import path from 'path';
import nconf from 'nconf';
import db from '../database';
import image from '../image';
import file from '../file';

// Inicializa nconf
nconf.argv().env().file({ file: path.join(__dirname, '../../node_modules/nconf/lib/config.json') });

// Tipos de datos necesarios
interface CoverData {
	file?: {
	  path: string;
	  type: string;
	};
	imageData?: string;
	position?: string;
	groupName: string;
  }
  
  interface UploadData {
	url: string;
  }

// Función principal
export default function (Groups: any) {
	const allowedTypes = ['image/png', 'image/jpeg', 'image/bmp'];
  
	// Función para actualizar la posición de la imagen de portada
	Groups.updateCoverPosition = async function (groupName: string, position: string): Promise<void> {
	  if (!groupName) {
		throw new Error('[[error:invalid-data]]');
	  }
	  await Groups.setGroupField(groupName, 'cover:position', position);
	};
  
	// Función para actualizar la imagen de portada
	Groups.updateCover = async function (uid: number, data: CoverData): Promise<{ url: string }> {
	  let tempPath = data.file ? data.file.path : '';
	  try {
		if (!data.imageData && !data.file && data.position) {
		  return await Groups.updateCoverPosition(data.groupName, data.position);
		}
  
		const type = data.file ? data.file.type : image.mimeFromBase64(data.imageData || '');
		if (!type || !allowedTypes.includes(type)) {
		throw new Error('[[error:invalid-image]]');
		}

		if (!tempPath) {
			tempPath = await image.writeImageDataToTempFile(data.imageData as string);
		}
  
		const filename = `groupCover-${data.groupName}${path.extname(tempPath)}`;
		const uploadData: UploadData = await image.uploadImage(filename, 'files', {
		  path: tempPath,
		  uid: uid,
		  name: 'groupCover',
		});
		const { url } = uploadData;
		await Groups.setGroupField(data.groupName, 'cover:url', url);
  
		await image.resizeImage({
		  path: tempPath,
		  width: 358,
		});
  
		const thumbUploadData: UploadData = await image.uploadImage(`groupCoverThumb-${data.groupName}${path.extname(tempPath)}`, 'files', {
			path: tempPath,
			uid: uid,
			name: 'groupCover',
		  });
		await Groups.setGroupField(data.groupName, 'cover:thumb:url', thumbUploadData.url);
  
		if (data.position) {
		  await Groups.updateCoverPosition(data.groupName, data.position);
		}
  
		return { url: url };
	  } finally {
		file.delete(tempPath);
	  }
	};
  
	// Función para eliminar la imagen de portada
	Groups.removeCover = async function (data: { groupName: string }): Promise<void> {
	  const fields = ['cover:url', 'cover:thumb:url'];
	  const values = await Groups.getGroupFields(data.groupName, fields);
  
	  await Promise.all(fields.map((field) => {
		if (!values[field] || !values[field].startsWith(`${nconf.get('relative_path')}/assets/uploads/files/`)) {
			return;
		}
  
		const filename = values[field].split('/').pop();
		const filePath = path.join(nconf.get('upload_path'), 'files', filename);
		return file.delete(filePath);
	  }));
  
	  await db.deleteObjectFields(`group:${data.groupName}`, ['cover:url', 'cover:thumb:url', 'cover:position']);
	};
  }