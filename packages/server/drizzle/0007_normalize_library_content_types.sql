UPDATE `libraries`
SET `content_type` = CASE `content_type`
	WHEN 'movies' THEN 'video/movie'
	WHEN 'photos' THEN 'image'
	ELSE `content_type`
END
WHERE `content_type` IN ('movies', 'photos');
