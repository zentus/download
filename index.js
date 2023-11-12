'use strict';
const fs = require('node:fs');
const path = require('node:path');
const {URL} = require('node:url');
const contentDisposition = require('content-disposition');
const archiveType = require('archive-type');
const decompress = require('decompress');
const filenamify = require('filenamify');
const getStream = require('get-stream');
const got = require('got');
const makeDir = require('make-dir');
const pify = require('pify');
const pEvent = require('p-event');
const fileType = require('file-type');
const extName = require('ext-name');

const fsP = pify(fs);
const filenameFromPath = res => path.basename(new URL(res.requestUrl).pathname);

const getExtFromMime = res => {
	const header = res.headers['content-type'];

	if (!header) {
		return null;
	}

	const exts = extName.mime(header);

	if (exts.length !== 1) {
		return null;
	}

	return exts[0].ext;
};

const getFilename = (res, data) => {
	const header = res.headers['content-disposition'];

	if (header) {
		const parsed = contentDisposition.parse(header);

		if (parsed.parameters && parsed.parameters.filename) {
			return parsed.parameters.filename;
		}
	}

	let filename = filenameFromPath(res);

	if (!path.extname(filename)) {
		const ext = (fileType(data) || {}).ext || getExtFromMime(res);

		if (ext) {
			filename = `${filename}.${ext}`;
		}
	}

	return filename;
};

module.exports = (uri, output, options) => {
	if (typeof output === 'object') {
		options = output;
		output = null;
	}

	options = {
		https:{
			rejectUnauthorized: process.env.npm_config_strict_ssl !== 'false'
		},
		encoding: options && options.encoding ? options.encoding : 'buffer',
		responseType: options && options.encoding ? 'text' : 'buffer',
		...options,
	};

	const stream = got.stream(uri, options);

	const promise = pEvent(stream, 'response').then(res => {
		return Promise.all([getStream(stream, options), res]);
	}).then(result => {
		const [data, res] = result;

		if (!output) {
			return options.extract && archiveType(data) ? decompress(data, options) : data;
		}

		const filename = options.filename || filenamify(getFilename(res, data));
		const outputFilepath = path.join(output, filename);

		if (options.extract && archiveType(data)) {
			return decompress(data, path.dirname(outputFilepath), options);
		}

		return makeDir(path.dirname(outputFilepath))
			.then(() => fsP.writeFile(outputFilepath, data))
			.then(() => data);
	})

	stream.then = promise.then.bind(promise);
	stream.catch = promise.catch.bind(promise);

	return stream;
};
